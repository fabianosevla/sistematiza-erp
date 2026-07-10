// @ts-nocheck
// ESTE ARQUIVO VAI EM: app/api/[tenant]/fidelidade/reativacao/route.ts
//
// Preview e envio MANUAL de avisos de reativação (o botão "Enviar agora" da
// aba Reativação). O envio automático diário é feito pelo Cron em
// /api/cron/fidelidade-reativacao.
import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { ReativacaoService } from '@/lib/services/fidelidade/ReativacaoService'
import { ok, serverError, badRequest } from '@/lib/api/responses'

type Params = { params: { tenant: string } }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const svc = new ReativacaoService(db)
      const { cfg } = await svc.getConfigCompleta()
      const candidatos    = cfg ? await svc.getCandidatos(cfg) : []
      const ultimosAvisos = await svc.ultimosAvisos(30)
      return ok({
        candidatos,
        ultimosAvisos,
        config: {
          reativacaoAtiva:  cfg?.reativacaoAtiva ?? false,
          programaAtivo:    cfg?.programaAtivo ?? false,
          diasInatividade:  cfg?.diasInatividade ?? 30,
          waConfigurado:    !!(cfg?.waPhoneNumberId && cfg?.waTemplateNome && cfg?.waTokenSet),
          horarioInicio:    cfg?.horarioInicio ?? 9,
          horarioFim:       cfg?.horarioFim ?? 20,
        },
      })
    } finally { release() }
  } catch (err) { return serverError(err) }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const body   = await req.json().catch(() => ({}))
    const clienteIds: number[] | undefined = Array.isArray(body?.clienteIds) ? body.clienteIds.map(Number) : undefined

    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const svc = new ReativacaoService(db)
      const { cfg, tokenCipher } = await svc.getConfigCompleta()
      if (!cfg) return badRequest('Fidelidade não configurada.')
      if (!cfg.waPhoneNumberId || !cfg.waTemplateNome) {
        return badRequest('Configure Phone Number ID e o nome do template na aba WhatsApp antes de enviar.')
      }

      let candidatos = await svc.getCandidatos(cfg)
      if (clienteIds && clienteIds.length > 0) {
        const set = new Set(clienteIds)
        candidatos = candidatos.filter(c => set.has(c.clienteId))
      }
      if (candidatos.length === 0) return ok({ enviados: 0, erros: 0, detalhes: [], message: 'Nenhum cliente elegível no momento.' })

      const resultado = await svc.enviar(cfg, tokenCipher, candidatos)
      return ok(resultado)
    } finally { release() }
  } catch (err) { return serverError(err) }
}