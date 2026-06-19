// app/api/[tenant]/compras/pedidos/[id]/route.ts
import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { PedidoCompraService } from '@/lib/services/compras/PedidoCompraService'
import { ok, serverError, notFound } from '@/lib/api/responses'

type P = { params: { tenant: string; id: string } }

export async function GET(req: NextRequest, { params }: P) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const result = await new PedidoCompraService(db).findById(Number(params.id))
      if (!result) return notFound('Pedido não encontrado')
      return ok(result)
    } finally { release() }
  } catch (err) { return serverError(err) }
}

// body: { acao: 'cancelar' }
export async function PUT(req: NextRequest, { params }: P) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const body = await req.json()
      if (body.acao === 'cancelar') {
        return ok(await new PedidoCompraService(db).cancelar(Number(params.id), 1))
      }
      return serverError(new Error('ação inválida'))
    } finally { release() }
  } catch (err) { return serverError(err) }
}

export async function DELETE(req: NextRequest, { params }: P) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      return ok(await new PedidoCompraService(db).excluir(Number(params.id), 1))
    } finally { release() }
  } catch (err) { return serverError(err) }
}