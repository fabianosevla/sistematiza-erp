// app/api/[tenant]/compras/listas/[id]/route.ts
import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { ListaComprasService } from '@/lib/services/compras/ListaComprasService'
import { ok, serverError, notFound } from '@/lib/api/responses'

type P = { params: { tenant: string; id: string } }

export async function GET(req: NextRequest, { params }: P) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const result = await new ListaComprasService(db).findById(Number(params.id))
      if (!result) return notFound('Lista não encontrada')
      return ok(result)
    } finally { release() }
  } catch (err) { return serverError(err) }
}

export async function PUT(req: NextRequest, { params }: P) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const { status } = await req.json()
      return ok(await new ListaComprasService(db).atualizarStatus(Number(params.id), status, 1))
    } finally { release() }
  } catch (err) { return serverError(err) }
}

export async function DELETE(req: NextRequest, { params }: P) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      return ok(await new ListaComprasService(db).excluir(Number(params.id), 1))
    } finally { release() }
  } catch (err) { return serverError(err) }
}