import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { exigirModulo } from '@/lib/auth/permissoes'
import { getDbForTenant } from '@/lib/db/connection'
import { LocalEstoqueService } from '@/lib/services/estoque/LocalEstoqueService'
import { ok, serverError } from '@/lib/api/responses'

type P = { params: { tenant: string } }

export async function GET(req: NextRequest, { params }: P) {
  try {
    const tenant = await resolveTenant(params.tenant)
    await exigirModulo(tenant.schemaName, 'estoque')
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      return ok(await new LocalEstoqueService(db).listTransferencias())
    } finally { release() }
  } catch (err) { return serverError(err) }
}

export async function POST(req: NextRequest, { params }: P) {
  try {
    const tenant = await resolveTenant(params.tenant)
    await exigirModulo(tenant.schemaName, 'estoque')
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const body = await req.json()
      return ok(await new LocalEstoqueService(db).transferir({ ...body, userId: 1 }))
    } finally { release() }
  } catch (err) { return serverError(err) }
}