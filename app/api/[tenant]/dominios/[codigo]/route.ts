// @ts-nocheck
import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { DominiosService } from '@/lib/services/dominios/DominiosService'
import { ok, serverError } from '@/lib/api/responses'

type Params = { params: { tenant: string; codigo: string } }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const dominio = await new DominiosService(db).getDominio(params.codigo)
      if (!dominio) return ok(null, 404)
      return ok(dominio)
    } finally { release() }
  } catch (err) { return serverError(err) }
}