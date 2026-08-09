// @ts-nocheck
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { usuarioAtualIdDb } from '@/lib/auth/usuarioAtual'
import { FiscalService } from '@/lib/services/fiscal/FiscalService'
import { ConfiguracoesService } from '@/lib/services/configuracoes/ConfiguracoesService'
import { ok, created, serverError } from '@/lib/api/responses'

type Params = { params: { tenant: string } }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
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
      return ok(await service.listNotas({ tipo, status }))
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
      if (action === 'emitir') {
        const cfg = await config.get()
        return ok(await fiscal.emitirViaFocusNfe(body.notaId, {
          token:    cfg?.focusNfeToken    ?? '',
          ambiente: cfg?.focusNfeAmbiente ?? 'homologacao',
        }))
      }
      if (action === 'cancelar') {
        const cfg = await config.get()
        return ok(await fiscal.cancelarNota(body.notaId, body.motivo, {
          token:    cfg?.focusNfeToken    ?? '',
          ambiente: cfg?.focusNfeAmbiente ?? 'homologacao',
        }))
      }

      const payload = notaSchema.parse(body)
      const result  = await fiscal.criarNota({ ...payload, userId })
      return created(result)
    } finally { release() }
  } catch (err) { return serverError(err) }
}