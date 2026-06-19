// app/api/[tenant]/compras/requisicoes/[id]/route.ts
import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { RequisicaoService } from '@/lib/services/compras/RequisicaoService'
import { ok, serverError } from '@/lib/api/responses'

type P = { params: { tenant: string; id: string } }

export async function PUT(req: NextRequest, { params }: P) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const { status } = await req.json()
      return ok(await new RequisicaoService(db).atualizarStatus(Number(params.id), status, 1))
    } finally { release() }
  } catch (err) { return serverError(err) }
}

export async function DELETE(req: NextRequest, { params }: P) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      return ok(await new RequisicaoService(db).excluir(Number(params.id), 1))
    } finally { release() }
  } catch (err) { return serverError(err) }
}