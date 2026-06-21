// @ts-nocheck
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
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

      const fiscal  = new FiscalService(db)
      const config  = new ConfiguracoesService(db)

      if (action === 'abrir-turno') {
        return created(await fiscal.abrirTurno({ ...body, userId: 1 }))
      }
      if (action === 'fechar-turno') {
        return ok(await fiscal.fecharTurno({ ...body, userId: 1 }))
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
      const result  = await fiscal.criarNota({ ...payload, userId: 1 })
      return created(result)
    } finally { release() }
  } catch (err) { return serverError(err) }
}