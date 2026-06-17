// app/api/[tenant]/perfis/meu-acesso/route.ts
import type { NextRequest } from 'next/server'
import { auth, currentUser } from '@clerk/nextjs/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { PerfisService } from '@/lib/services/perfis/PerfisService'
import { ok, serverError } from '@/lib/api/responses'

type Params = { params: { tenant: string } }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { userId } = await auth()
    if (!userId) throw new Error('UNAUTHORIZED')

    const user = await currentUser()
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const service = new PerfisService(db)
      const acessos = await service.getAcessosUsuario(userId)
      return ok(acessos)
    } finally { release() }
  } catch (err) { return serverError(err) }
}