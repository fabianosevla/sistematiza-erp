import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { ComandaService } from '@/lib/services/comandas/ComandaService'
import { ok, serverError } from '@/lib/api/responses'

type Params = { params: { tenant: string; id: string } }

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const service = new ComandaService(db)
      const result  = await service.cancelar({ comandaId: Number(params.id), userId: 1 })
      return ok(result)
    } finally {
      release()
    }
  } catch (err) {
    return serverError(err)
  }
}