import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { ComandaService } from '@/lib/services/comandas/ComandaService'
import { ok, serverError, notFound } from '@/lib/api/responses'

type Params = { params: { tenant: string; id: string } }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const service = new ComandaService(db)
      const result  = await service.findById(Number(params.id))
      if (!result) return notFound('Comanda não encontrada')
      return ok(result)
    } finally {
      release()
    }
  } catch (err) {
    return serverError(err)
  }
}