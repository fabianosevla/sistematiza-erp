import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { exigirModulo } from '@/lib/auth/permissoes'
import { getDbForTenant } from '@/lib/db/connection'
import { EntradaNfeService } from '@/lib/services/estoque/EntradaNfeService'
import { ok, serverError, notFound } from '@/lib/api/responses'

type P = { params: { tenant: string; id: string } }

export async function GET(req: NextRequest, { params }: P) {
  try {
    const tenant = await resolveTenant(params.tenant)
    await exigirModulo(tenant.schemaName, 'estoque')
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const result = await new EntradaNfeService(db).findById(Number(params.id))
      if (!result) return notFound('Entrada não encontrada')
      return ok(result)
    } finally { release() }
  } catch (err) { return serverError(err) }
}

// body: { acao: 'mapear-item', itemId, insumoId } | { acao: 'confirmar' }
export async function PUT(req: NextRequest, { params }: P) {
  try {
    const tenant = await resolveTenant(params.tenant)
    await exigirModulo(tenant.schemaName, 'estoque')
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const body = await req.json()
      const svc  = new EntradaNfeService(db)

      if (body.acao === 'mapear-item') {
        return ok(await svc.mapearItem(body.itemId, body.insumoId, 1))
      }
      if (body.acao === 'confirmar') {
        return ok(await svc.confirmar(Number(params.id), 1))
      }
      return serverError(new Error('ação inválida'))
    } finally { release() }
  } catch (err) { return serverError(err) }
}