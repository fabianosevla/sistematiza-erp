// app/api/[tenant]/compras/conferencias/route.ts
import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { ConferenciaService } from '@/lib/services/compras/ConferenciaService'
import { ok, created, serverError } from '@/lib/api/responses'

type P = { params: { tenant: string } }

// GET /api/[tenant]/compras/conferencias?pedidoId=X — busca conferência de um pedido
export async function GET(req: NextRequest, { params }: P) {
  try {
    const url    = new URL(req.url)
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const pedidoId = Number(url.searchParams.get('pedidoId') ?? 0)
      return ok(await new ConferenciaService(db).findByPedido(pedidoId))
    } finally { release() }
  } catch (err) { return serverError(err) }
}

// POST — inicia conferência a partir de um pedido. body: { pedidoId }
export async function POST(req: NextRequest, { params }: P) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const { pedidoId } = await req.json()
      return created(await new ConferenciaService(db).iniciar(pedidoId, 1))
    } finally { release() }
  } catch (err) { return serverError(err) }
}