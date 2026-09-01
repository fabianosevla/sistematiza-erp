// @ts-nocheck
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { resolveTenant } from '@/lib/auth/tenant'
import { exigirModulo } from '@/lib/auth/permissoes'
import { getDbForTenant } from '@/lib/db/connection'
import { usuarioAtualIdDb } from '@/lib/auth/usuarioAtual'
import { FiscalService } from '@/lib/services/fiscal/FiscalService'
import { ConfiguracoesService } from '@/lib/services/configuracoes/ConfiguracoesService'
import { decryptSecretOuTextoPuro } from '@/lib/crypto/secretBox'
import { ok, created, badRequest, serverError } from '@/lib/api/responses'

type Params = { params: { tenant: string } }

// Turno/notas fiscais aqui são só a tela de Fiscal (FiscalView/NovaNotaModal).
// O caixa "simples" do PDV é outra rota (app/api/[tenant]/caixa), não esta.
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    await exigirModulo(tenant.schemaName, 'fiscal')
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const { searchParams } = new URL(req.url)
      const tipo      = searchParams.get('tipo')      ?? undefined
      const status    = searchParams.get('status')    ?? undefined
      const turno     = searchParams.get('turno')     === 'true'
      const relatorio = searchParams.get('relatorio') ?? undefined
      const service   = new FiscalService(db)

      // Resumo do turno aberto: o que passou pelo caixa desde a abertura.
      // Leitura, por isso GET.
      if (searchParams.get('resumoTurno') === 'true') {
        const t = await service.getTurnoAberto()
        return ok(t ? await service.resumoTurno(t.turnoId) : null)
      }

      if (relatorio === 'resumo-mensal') {
        const ano = Number(searchParams.get('ano') ?? new Date().getFullYear())
        return ok(await service.relatorioResumoMensal(ano))
      }
      if (relatorio === 'por-forma') {
        return ok(await service.relatorioPorFormaPagamento({
          dataInicio: searchParams.get('dataInicio') ?? undefined,
          dataFim:    searchParams.get('dataFim') ?? undefined,
        }))
      }
      if (relatorio === 'apuracao') {
        return ok(await service.relatorioApuracaoImpostos({
          dataInicio: searchParams.get('dataInicio') ?? undefined,
          dataFim:    searchParams.get('dataFim') ?? undefined,
        }))
      }

      if (turno) return ok(await service.getTurnoAberto())

      const notaId = searchParams.get('notaId')
      if (notaId) {
        const nota = await service.findNotaById(Number(notaId))
        if (!nota) return badRequest('Nota não encontrada')
        return ok(nota)
      }

      const page  = Math.max(1, Number(searchParams.get('page') ?? 1))
      const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') ?? 20)))
      return ok(await service.listNotas({ tipo, status, page, limit }))
    } finally { release() }
  } catch (err) { return serverError(err) }
}

const notaSchema = z.object({
  tipo:        z.string(),
  cnpjCpf:     z.string().optional(),
  razaoSocial: z.string().optional(),
  uf:          z.string().optional(),
  cfop:        z.string().optional(),
  valorTotal:  z.number().int(),
  vendaId:     z.number().int().optional(),
  itens: z.array(z.object({
    descricao:    z.string(),
    quantidade:   z.number(),
    precoUnitario: z.number().int(),
    ncm:          z.string().optional(),
    cfop:         z.string().optional(),
    cstCsosn:     z.string().optional(),
    aliqIcms:     z.number().optional(),
  })),
  emitir: z.boolean().default(false),
})

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    await exigirModulo(tenant.schemaName, 'fiscal')
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const body    = await req.json()
      const { searchParams } = new URL(req.url)
      const action  = searchParams.get('action')

      // schemaName vai junto: e o prefixo do tenant no arquivo de XML.
      const fiscal  = new FiscalService(db, tenant.schemaName)
      const config  = new ConfiguracoesService(db)
      // Quem abriu o caixa, quem cancelou a nota. Antes ia 1 fixo nas cinco
      // acoes — e num controle que existe para atribuir responsabilidade,
      // gravar sempre a mesma pessoa anula o proposito.
      const userId  = await usuarioAtualIdDb(db)

      if (action === 'abrir-turno') {
        return created(await fiscal.abrirTurno({ ...body, userId }))
      }
      if (action === 'fechar-turno') {
        return ok(await fiscal.fecharTurno({ ...body, userId }))
      }
      // Editar item de nota pendente — válvula de escape pra estado/cenário
      // ainda não cadastrado (ver comentário em atualizarItemFiscal).
      if (action === 'atualizar-item-fiscal') {
        try {
          const { itemId, ...campos } = body
          return ok(await fiscal.atualizarItemFiscal(Number(itemId), campos, userId))
        } catch (err: any) {
          return badRequest(err?.message || 'Falha ao atualizar item.')
        }
      }
      // Devolução, transferência, bonificação e afins — CFOP/CSOSN vêm da
      // regra escolhida, não do perfil do produto (ver criarNotaOperacao).
      if (action === 'criar-operacao') {
        try {
          return created(await fiscal.criarNotaOperacao({ ...body, userId }))
        } catch (err: any) {
          return badRequest(err?.message || 'Falha ao registrar a operação.')
        }
      }
      // Emissão/cancelamento passam pela Focus (ou quem estiver configurado) —
      // erro daqui quase sempre já vem com mensagem útil (SEFAZ, validação de
      // parametrização, token). Mandar isso pro serverError() genérico
      // enterrava a mensagem real atrás de "Erro interno do servidor" — quem
      // clicava em Emitir não via o que de fato aconteceu, só "tente de novo".
      // Aqui devolve a mensagem original, sem mascarar.
      if (action === 'emitir') {
        try {
          const cfg = await config.get()
          return ok(await fiscal.emitirViaFocusNfe(body.notaId, {
            token:    decryptSecretOuTextoPuro(cfg?.focusNfeToken),
            ambiente: cfg?.focusNfeAmbiente ?? 'homologacao',
          }))
        } catch (err: any) {
          return badRequest(err?.message || 'Falha ao emitir a nota — sem mensagem detalhada.')
        }
      }
      if (action === 'cancelar') {
        try {
          const cfg = await config.get()
          return ok(await fiscal.cancelarNota(body.notaId, body.motivo, {
            token:    decryptSecretOuTextoPuro(cfg?.focusNfeToken),
            ambiente: cfg?.focusNfeAmbiente ?? 'homologacao',
          }))
        } catch (err: any) {
          return badRequest(err?.message || 'Falha ao cancelar a nota — sem mensagem detalhada.')
        }
      }

      const payload = notaSchema.parse(body)
      const result  = await fiscal.criarNota({ ...payload, userId })
      return created(result)
    } finally { release() }
  } catch (err) { return serverError(err) }
}