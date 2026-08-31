// @ts-nocheck
// ESTE ARQUIVO VAI EM: app/api/[tenant]/vendas/route.ts
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { resolveTenant } from '@/lib/auth/tenant'
import { exigirModulo } from '@/lib/auth/permissoes'
import { getDbForTenant } from '@/lib/db/connection'
import { usuarioAtualIdDb } from '@/lib/auth/usuarioAtual'
import { VendaService } from '@/lib/services/vendas/VendaService'
import { ok, created, serverError, badRequest } from '@/lib/api/responses'

type Params = { params: { tenant: string } }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    // GET é a listagem/kpis da tela de Vendas — o PDV não usa este verbo (só
    // POST para criar venda), então dá para exigir o módulo aqui sem quebrar
    // o PDV.
    await exigirModulo(tenant.schemaName, 'vendas')
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const { searchParams } = new URL(req.url)
      const page       = Math.max(1, Number(searchParams.get('page') ?? 1))
      const limit      = Math.min(100, Math.max(1, Number(searchParams.get('limit') ?? 20)))
      const dataInicio = searchParams.get('dataInicio') ?? undefined
      const dataFim    = searchParams.get('dataFim') ?? undefined
      const origem     = searchParams.get('origem') ?? undefined
      const tipo       = searchParams.get('tipo') ?? undefined
      const busca      = searchParams.get('busca') ?? undefined

      const service = new VendaService(db, tenant.schemaName)

      if (tipo === 'kpis') return ok(await service.kpis())

      const result = await service.list({ page, limit, dataInicio, dataFim, origem, busca })
      return ok(result)
    } finally {
      release()
    }
  } catch (err) {
    return serverError(err)
  }
}

const criarVendaSchema = z.object({
  itens: z.array(z.object({
    produtoId:   z.number().int(),
    quantidade:  z.number().int().min(1),
    tipoPrecao:  z.string().optional(),
  })).min(1),
  clienteId:       z.number().int().optional().nullable(),
  // Cliente avulso: quem compra uma vez e não vale cadastrar. Só um nome —
  // sem histórico, sem tabela de preço e sem cashback.
  nomeClienteAvulso: z.string().max(200).optional().nullable(),
  desconto:        z.number().int().default(0),
  // Real, não líquido — `desconto` acima já vem líquido do acréscimo (é o
  // que o total e a nota fiscal usam). Este campo só existe pra 2ª via do
  // cupom conseguir mostrar os dois valores certos depois. Ver t_venda no
  // schema do Drizzle.
  acrescimo:       z.number().int().default(0),
  pagamentos:      z.array(z.object({
    forma:  z.string(),
    valor:  z.number().int(),
  })).min(1),
  // campos extras que o frontend envia
  tipoEntrega:        z.string().optional(),
  dataEntrega:        z.string().optional().nullable(),
  enderecoEntrega:    z.string().optional().nullable(),
  vendedor:           z.string().optional().nullable(),
  observacao:         z.string().optional().nullable(),
  vendidaEm:          z.string().optional(),
  // Fidelidade: quanto de cashback o cliente quer resgatar (centavos)
  usarCashback:       z.number().int().min(0).optional(),
  // nenhum | nfce | nfe. Sem isso o Zod DESCARTA o campo em silêncio e toda
  // venda nasceria como 'nenhum' — já aconteceu neste projeto com o tipo do
  // produto e com os preços de atacado.
  documentoFiscal:    z.enum(['nenhum', 'nfce', 'nfe']).optional(),
  // Emitir e imprimir são decisões separadas: a nota pode ser emitida e ficar
  // só no arquivo, sem via de papel. Quem imprime é o módulo Fiscal, depois da
  // autorização — por isso a intenção fica gravada na venda.
  imprimirNota:       z.boolean().optional(),
  // Qual maquina fez a venda. Cada PC guarda o proprio numero.
  numeroCaixa:        z.number().int().positive().optional(),
})

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const body = await req.json()

      let payload: z.infer<typeof criarVendaSchema>
      try {
        payload = criarVendaSchema.parse(body)
      } catch (zodErr: any) {
        return badRequest('Dados inválidos: ' + JSON.stringify(zodErr.errors))
      }

      // Garante pelo menos 1 pagamento com valor > 0 — a menos que a venda
      // esteja sendo quitada inteiramente com cashback.
      const pagamentosValidos = payload.pagamentos.filter(p => p.valor > 0)
      const usaCashback = !!(payload.usarCashback && payload.usarCashback > 0)
      if (pagamentosValidos.length === 0 && !usaCashback) {
        return badRequest('Informe pelo menos uma forma de pagamento com valor.')
      }

      const service = new VendaService(db, tenant.schemaName)
      const result  = await service.criarDireta({
        ...payload,
        pagamentos: pagamentosValidos,
        clienteId:  payload.clienteId ?? undefined,
        nomeClienteAvulso: payload.nomeClienteAvulso ?? undefined,
        usarCashback: payload.usarCashback ?? undefined,
        documentoFiscal: payload.documentoFiscal ?? 'nenhum',
        imprimirNota:    payload.imprimirNota ?? false,
        numeroCaixa:     payload.numeroCaixa ?? undefined,
        userId: await usuarioAtualIdDb(db),
      })
      return created(result)
    } finally {
      release()
    }
  } catch (err) {
    return serverError(err)
  }
}

export async function DELETE(req: NextRequest, { params: routeParams }: Params) {
  // Esta rota não tem [id] — o delete fica em /api/[tenant]/vendas/[id]/route.ts
  return serverError(new Error('Use DELETE /api/[tenant]/vendas/[id]'))
}