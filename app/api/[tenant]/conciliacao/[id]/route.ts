// app/api/[tenant]/conciliacao/[id]/route.ts
import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { ConciliacaoService } from '@/lib/services/financeiro/ConciliacaoService'
import { ok, serverError } from '@/lib/api/responses'

type P = { params: { tenant: string; id: string } }

// PUT /api/[tenant]/conciliacao/[id]
// body: { acao: 'conciliar' | 'ignorar', tipo?: 'conta_pagar'|'conta_receber'|'outro', referenciaId?: number }
export async function PUT(req: NextRequest, { params }: P) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const body = await req.json()
      const svc  = new ConciliacaoService(db)
      const id   = Number(params.id)

      if (body.acao === 'ignorar') return ok(await svc.ignorar(id, 1))
      return ok(await svc.conciliar(id, {
        tipo:         body.tipo ?? 'outro',
        referenciaId: body.referenciaId,
      }, 1))
    } finally { release() }
  } catch (err) { return serverError(err) }
}