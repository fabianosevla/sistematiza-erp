import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { VendaService } from '@/lib/services/vendas/VendaService'
import { ok, serverError, notFound } from '@/lib/api/responses'

type Params = { params: { tenant: string; id: string } }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const service = new VendaService(db)
      const result  = await service.findById(Number(params.id))
      if (!result) return notFound('Venda não encontrada')
      return ok(result)
    } finally {
      release()
    }
  } catch (err) {
    return serverError(err)
  }
}