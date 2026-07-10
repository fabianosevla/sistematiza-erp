// @ts-nocheck
// ESTE ARQUIVO VAI EM: app/api/cron/fidelidade-reativacao/route.ts
//
// Cron diário (rodado de hora em hora pelo Vercel) que percorre TODOS os
// tenants e, para cada um com o programa e a reativação ativos, com WhatsApp
// configurado e DENTRO da janela de horário do tenant, envia os avisos de
// reativação pendentes.
//
// Protegido por CRON_SECRET: a chamada precisa vir com
//   Authorization: Bearer <CRON_SECRET>
// ou do próprio Vercel Cron (header x-vercel-cron). Configure CRON_SECRET nas
// variáveis de ambiente da Vercel e no vercel.json (ver arquivo entregue).
import type { NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'
import { getPublicDb, getDbForTenant } from '@/lib/db/connection'
import { dbTenant } from '@/lib/db/schemas/public'
import { ReativacaoService } from '@/lib/services/fidelidade/ReativacaoService'
import { ok, serverError, unauthorized } from '@/lib/api/responses'

// Cron pode demorar; garante execução dinâmica (sem cache) e mais tempo.
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  try {
    const auth   = req.headers.get('authorization') ?? ''
    const isCron = req.headers.get('x-vercel-cron') != null
    const secret = process.env.CRON_SECRET ?? ''
    const autorizado = isCron || (secret && auth === `Bearer ${secret}`)
    if (!autorizado) return unauthorized()

    // Lista todos os tenants ativos
    const { db: publicDb, release: releasePublic } = await getPublicDb()
    let tenants: { schemaName: string; slug: string }[] = []
    try {
      const rows = await publicDb
        .select({ schemaName: dbTenant.schemaName, slug: dbTenant.slug })
        .from(dbTenant)
        .where(eq(dbTenant.activeFlag, true))
      tenants = rows
    } finally {
      releasePublic()
    }

    const resumo: any[] = []
    for (const t of tenants) {
      if (!t.schemaName) continue
      const { db, release } = await getDbForTenant(t.schemaName)
      try {
        const svc = new ReativacaoService(db)
        const { cfg, tokenCipher } = await svc.getConfigCompleta()
        if (!cfg || !cfg.programaAtivo || !cfg.reativacaoAtiva) {
          resumo.push({ tenant: t.slug, pulado: 'inativo' })
          continue
        }
        if (!cfg.waPhoneNumberId || !cfg.waTemplateNome || !cfg.waTokenSet) {
          resumo.push({ tenant: t.slug, pulado: 'whatsapp_nao_configurado' })
          continue
        }
        if (!svc.dentroDoHorario(cfg)) {
          resumo.push({ tenant: t.slug, pulado: 'fora_do_horario' })
          continue
        }
        const candidatos = await svc.getCandidatos(cfg)
        if (candidatos.length === 0) {
          resumo.push({ tenant: t.slug, candidatos: 0 })
          continue
        }
        const r = await svc.enviar(cfg, tokenCipher, candidatos)
        resumo.push({ tenant: t.slug, candidatos: candidatos.length, enviados: r.enviados, erros: r.erros })
      } catch (e: any) {
        resumo.push({ tenant: t.slug, erro: e?.message ?? 'falha' })
      } finally {
        release()
      }
    }

    return ok({ executadoEm: new Date().toISOString(), tenants: tenants.length, resumo })
  } catch (err) {
    return serverError(err)
  }
}