import { auth } from '@clerk/nextjs/server'
import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { clienteInsertSchema } from '@/lib/validations/cadastros'
import { ClienteService } from '@/lib/services/cadastros/ClienteService'
import { ok, created, serverError } from '@/lib/api/responses'

type Params = { params: { tenant: string } }

// GET — listar clientes
export async function GET(req: NextRequest, { params }: Params) {
  const { release, db } = await getDbForTenant('public') // placeholder até resolver tenant
  try {
    const { userId } = await auth()
    if (!userId) return serverError(new Error('UNAUTHORIZED'))

    const tenant = await resolveTenant(params.tenant)
    release()

    const { db: tenantDb, release: tenantRelease } = await getDbForTenant(tenant.schemaName)
    try {
      const { searchParams } = new URL(req.url)
      const page   = Math.max(1, Number(searchParams.get('page') ?? 1))
      const limit  = Math.min(100, Math.max(1, Number(searchParams.get('limit') ?? 20)))
      const search = searchParams.get('search') ?? undefined

      const service = new ClienteService(tenantDb)
      const result  = await service.list({ page, limit, search })
      return ok(result)
    } finally {
      tenantRelease()
    }
  } catch (err) {
    release()
    return serverError(err)
  }
}

// POST — criar cliente
export async function POST(req: NextRequest, { params }: Params) {
  let released = false
  const { db: _db, release } = await getDbForTenant('public')
  try {
    const { userId } = await auth()
    if (!userId) return serverError(new Error('UNAUTHORIZED'))

    const tenant = await resolveTenant(params.tenant)
    release(); released = true

    const { db: tenantDb, release: tenantRelease } = await getDbForTenant(tenant.schemaName)
    try {
      const body    = await req.json()
      const payload = clienteInsertSchema.parse(body)

      const service = new ClienteService(tenantDb)
      const result  = await service.create(payload, 1) // TODO: resolver usuarioId do tenant
      return created(result)
    } finally {
      tenantRelease()
    }
  } catch (err) {
    if (!released) release()
    return serverError(err)
  }
}
