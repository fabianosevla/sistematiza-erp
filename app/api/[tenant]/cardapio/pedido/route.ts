// ESTE ARQUIVO VAI EM: app/api/[tenant]/cardapio/pedido/route.ts
//
// ROTA PÚBLICA — sem login. Ver middleware.ts (isPublicRoute).
//
// PREÇO NUNCA VEM DO NAVEGADOR. O cliente manda só produtoId + quantidade;
// o preço é buscado de novo aqui, em t_produto.preco_varejo. A rota interna
// de pedidos (app/api/[tenant]/pedidos/route.ts) confia no precoUnitario que
// vem no corpo — aceitável para quem já está logado, mas numa rota aberta
// pra internet isso é porta pra fechar pedido de R$0,01.
//
// Autoria do pedido: sem usuário logado, usuarioAtualIdDb cai no PADRAO=1 —
// o mesmo fallback que qualquer escrita sem sessão já usa neste projeto
// (ver lib/auth/usuarioAtual.ts). Não é preciso um usuário "sistema" à parte.
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { resolveTenantPublico } from '@/lib/auth/tenantPublico'
import { getDbForTenant, pool } from '@/lib/db/connection'
import { usuarioAtualIdDb } from '@/lib/auth/usuarioAtual'
import { PedidoService } from '@/lib/services/producao/PedidoService'
import { dbProduto } from '@/lib/db/schemas/cadastros'
import { ok, notFound, badRequest, serverError } from '@/lib/api/responses'

type Params = { params: { tenant: string } }

const pedidoCardapioSchema = z.object({
  nome:            z.string().min(2).max(200),
  telefone:        z.string().min(8).max(20),
  documento:       z.string().max(20).optional().nullable(),
  tipoVenda:       z.enum(['balcao', 'entrega']).default('entrega'),
  enderecoEntrega: z.string().max(300).optional().nullable(),
  observacao:      z.string().max(500).optional().nullable(),
  formaPagamentoId: z.number().int().optional().nullable(),
  itens: z.array(z.object({
    produtoId:  z.number().int(),
    quantidade: z.number().int().min(1),
  })).min(1),
}).superRefine((dados, ctx) => {
  if (dados.tipoVenda === 'entrega' && !dados.enderecoEntrega?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['enderecoEntrega'], message: 'Informe o endereço de entrega' })
  }
})

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenantPublico(params.tenant)
    if (!tenant) return notFound('Cardápio não disponível')

    const body    = await req.json()
    const payload = pedidoCardapioSchema.parse(body)

    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      // Preço de verdade, direto do banco — ver aviso no topo do arquivo.
      const produtoIds = payload.itens.map(i => i.produtoId)
      const produtosDisponiveis = await db.select().from(dbProduto)
      const mapaProdutos = new Map(produtosDisponiveis.map(p => [p.produtoId, p]))

      const itensComPreco = payload.itens.map(item => {
        const produto = mapaProdutos.get(item.produtoId)
        if (!produto || !produto.disponivelCardapio || !produto.activeFlag) {
          throw new Error(`PRODUTO_INDISPONIVEL:${item.produtoId}`)
        }
        return { produtoId: item.produtoId, quantidade: item.quantidade, precoUnitario: produto.precoVarejo }
      })

      // Cliente do cardápio vira cadastro de verdade — dedupe por documento
      // (dígitos) e, na falta dele, por telefone. Mesma ideia da rota
      // app/api/[tenant]/cadastros/clientes/route.ts, com fallback novo.
      const client = await pool.connect()
      let clienteId: number
      try {
        await client.query(`SET search_path TO "${tenant.schemaName}", public`)
        const uidCliente = await usuarioAtualIdDb(db)

        const doc = payload.documento?.trim() || null
        let existente = doc
          ? await client.query(
              `SELECT cliente_id FROM t_cliente
               WHERE active_flg = true
                 AND REGEXP_REPLACE(COALESCE(documento,''), '[^0-9]', '', 'g') = REGEXP_REPLACE($1, '[^0-9]', '', 'g')
                 AND REGEXP_REPLACE($1, '[^0-9]', '', 'g') <> ''
               LIMIT 1`, [doc])
          : { rows: [] as any[] }

        if (existente.rows.length === 0) {
          existente = await client.query(
            `SELECT cliente_id FROM t_cliente
             WHERE active_flg = true
               AND REGEXP_REPLACE(COALESCE(telefone,'') || COALESCE(celular,''), '[^0-9]', '', 'g') LIKE '%' || REGEXP_REPLACE($1, '[^0-9]', '', 'g') || '%'
               AND REGEXP_REPLACE($1, '[^0-9]', '', 'g') <> ''
             LIMIT 1`, [payload.telefone])
        }

        if (existente.rows.length > 0) {
          clienteId = existente.rows[0].cliente_id
        } else {
          const novo = await client.query(`
            INSERT INTO t_cliente (
              tipo_pessoa, nome_completo, documento, celular, observacao,
              active_flg, modification_num, created_by, updated_by, created_dt, updated_dt
            ) VALUES ('PF',$1,$2,$3,'Cadastrado pelo cardápio online',true,0,$4,$4,NOW(),NOW())
            RETURNING cliente_id as "clienteId"
          `, [payload.nome.trim(), doc, payload.telefone.trim(), uidCliente])
          clienteId = novo.rows[0].clienteId
        }
      } finally {
        client.release()
      }

      const uid     = await usuarioAtualIdDb(db)
      const service = new PedidoService(db)
      const result  = await service.criar({
        clienteId,
        tipoVenda:        payload.tipoVenda,
        dataPedido:       new Date().toISOString(),
        valorEntrega:     0,
        enderecoEntrega:  payload.enderecoEntrega ?? undefined,
        observacao:       payload.observacao ?? undefined,
        formaPagamentoId: payload.formaPagamentoId ?? undefined,
        itens:            itensComPreco,
        userId:           uid,
      })

      return ok(result)
    } finally {
      release()
    }
  } catch (err: any) {
    if (typeof err?.message === 'string' && err.message.startsWith('PRODUTO_INDISPONIVEL:')) {
      return badRequest('Um dos produtos do pedido não está mais disponível.')
    }
    return serverError(err)
  }
}
