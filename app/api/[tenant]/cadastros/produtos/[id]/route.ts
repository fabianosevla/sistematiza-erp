import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { produtoUpdateSchema } from '@/lib/validations/cadastros'
import { ProdutoService } from '@/lib/services/cadastros/ProdutoService'
import { ok, serverError, notFound, conflict } from '@/lib/api/responses'

type Params = { params: { tenant: string; id: string } }

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const body    = await req.json()
      const payload = produtoUpdateSchema.parse(body)
      const service = new ProdutoService(db)
      const result  = await service.update(Number(params.id), payload, 1)
      if ('error' in result) {
        if (result.error === 'NOT_FOUND') return notFound('Produto não encontrado')
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
      const service = new ProdutoService(db)
      await service.softDelete(Number(params.id), 1)
      return ok({ deleted: true })
    } finally {
      release()
    }
  } catch (err) {
    return serverError(err)
  }
}