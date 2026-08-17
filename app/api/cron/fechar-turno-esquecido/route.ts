// ESTE ARQUIVO VAI EM: app/api/cron/fechar-turno-esquecido/route.ts
//
// Cron diário (23:59 horário de Brasília = 02:59 UTC) que percorre todos os
// tenants com turno de caixa ativo e fecha à força qualquer turno que ainda
// esteja aberto. Existe porque um turno aberto em 13/08 só foi fechado na
// manhã de 14/08 — ninguém fechou a gaveta na virada do dia.
//
// Sem ninguém pra contar a gaveta, o fechamento usa o valor ESPERADO (não um
// valor contado) como valorFechamento — a diferença fica sempre zero, e a
// observação deixa claro que foi o sistema que fechou, não o operador.
//
// Protegido por CRON_SECRET (Authorization: Bearer <CRON_SECRET>) ou pelo
// próprio Vercel Cron (header x-vercel-cron) — mesmo padrão do cron de
// reativação da Fidelidade. Precisa ser cadastrado no painel da Vercel
// (Project → Settings → Cron Jobs), não tem vercel.json neste repo.
import type { NextRequest } from 'next/server'
import { eq, sql } from 'drizzle-orm'
import { getPublicDb, getDbForTenant } from '@/lib/db/connection'
import { dbTenant } from '@/lib/db/schemas/public'
import { CaixaService } from '@/lib/services/caixa/CaixaService'
import { ok, serverError, unauthorized } from '@/lib/api/responses'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  try {
    const auth   = req.headers.get('authorization') ?? ''
    const isCron = req.headers.get('x-vercel-cron') != null
    const secret = process.env.CRON_SECRET ?? ''
    const autorizado = isCron || (secret && auth === `Bearer ${secret}`)
    if (!autorizado) return unauthorized()

    const { db: publicDb, release: releasePublic } = await getPublicDb()
    let tenants: { schemaName: string; slug: string }[] = []
    try {
      tenants = await publicDb
        .select({ schemaName: dbTenant.schemaName, slug: dbTenant.slug })
        .from(dbTenant)
        .where(eq(dbTenant.activeFlag, true))
    } finally {
      releasePublic()
    }

    const resumo: any[] = []
    for (const t of tenants) {
      if (!t.schemaName) continue
      const { db, release } = await getDbForTenant(t.schemaName)
      try {
        const cfgRes = await db.execute(sql`SELECT turno_caixa_ativo FROM t_configuracoes_tenant LIMIT 1`)
        const turnoAtivo = (cfgRes.rows[0] as any)?.turno_caixa_ativo === true
        if (!turnoAtivo) {
          resumo.push({ tenant: t.slug, pulado: 'turno_caixa_inativo' })
          continue
        }

        const svc = new CaixaService(db)
        const abertos = await svc.abertos()
        if (abertos.length === 0) {
          resumo.push({ tenant: t.slug, fechados: 0 })
          continue
        }

        const fechados: number[] = []
        for (const turno of abertos) {
          const res = await svc.resumo(turno.turnoId)
          if (!res) continue
          await svc.fechar({
            turnoId: turno.turnoId,
            valorFechamento: res.esperadoGaveta,
            observacao: 'Fechado automaticamente pelo sistema às 23:59 — ninguém fechou o turno manualmente. Conferência de gaveta não realizada.',
            userId: 1,
          })
          fechados.push(turno.turnoId)
        }
        resumo.push({ tenant: t.slug, fechados: fechados.length, turnoIds: fechados })
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
