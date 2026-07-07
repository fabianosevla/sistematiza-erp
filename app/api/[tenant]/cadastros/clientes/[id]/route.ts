import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { clienteUpdateSchema } from '@/lib/validations/cadastros'
import { ClienteService } from '@/lib/services/cadastros/ClienteService'
import { ok, serverError, notFound, conflict } from '@/lib/api/responses'

type Params = { params: { tenant: string; id: string } }

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const body    = await req.json()
      const payload = clienteUpdateSchema.parse(body)
      const service = new ClienteService(db)
      const result  = await service.update(Number(params.id), payload, 1)
      if ('error' in result) {
        if (result.error === 'NOT_FOUND') return notFound('Cliente não encontrado')
        return conflict('Registro alterado por outro usuário', result.modificationNum)
      }
      return ok(result)
    } finally {
      release()
    }
  } catch (err) {
    return serverError(err)
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const service = new ClienteService(db)
      await service.softDelete(Number(params.id), 1)
      return ok({ deleted: true })
    } finally {
      release()
    }
  } catch (err) {
    return serverError(err)
  }
}
