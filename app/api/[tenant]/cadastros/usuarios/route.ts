import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { UsuarioService } from '@/lib/services/cadastros/UsuarioService'
import { ok, serverError } from '@/lib/api/responses'

type Params = { params: { tenant: string } }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const { searchParams } = new URL(req.url)
      const page  = Math.max(1, Number(searchParams.get('page') ?? 1))
      const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') ?? 20)))
      const service = new UsuarioService(db)
      const result  = await service.list({ page, limit })
      return ok(result)
    } finally {
      release()
    }
  } catch (err) {
    return serverError(err)
  }
}