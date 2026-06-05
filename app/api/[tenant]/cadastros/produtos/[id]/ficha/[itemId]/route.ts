// @ts-nocheck
import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { FichaTecnicaService } from '@/lib/services/cadastros/FichaTecnicaService'
import { ok, serverError } from '@/lib/api/responses'

type Params = { params: { tenant: string; id: string; itemId: string } }

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const service = new FichaTecnicaService(db)
      await service.removeItem(Number(params.itemId), 1)
      return ok({ deleted: true })
    } finally {
      release()
    }
  } catch (err) {
    return serverError(err)
  }
}