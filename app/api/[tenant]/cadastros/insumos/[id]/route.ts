// ESTE ARQUIVO VAI EM: app/api/[tenant]/cadastros/insumos/[id]/route.ts
import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { usuarioAtualIdDb } from '@/lib/auth/usuarioAtual'
import { insumoUpdateSchema } from '@/lib/validations/cadastros'
import { InsumoService } from '@/lib/services/cadastros/InsumoService'
import { ok, serverError, notFound, conflict } from '@/lib/api/responses'

type Params = { params: { tenant: string; id: string } }

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const body    = await req.json()
      const payload = insumoUpdateSchema.parse(body)
      const uid     = await usuarioAtualIdDb(db)   // antes: literal 1
      const service = new InsumoService(db)
      const result  = await service.update(Number(params.id), payload, uid)
      if ('error' in result) {
        if (result.error === 'NOT_FOUND') return notFound('Insumo não encontrado')
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
      const uid     = await usuarioAtualIdDb(db)
      const service = new InsumoService(db)
      await service.softDelete(Number(params.id), uid)
      return ok({ deleted: true })
    } finally {
      release()
    }
  } catch (err) {
    return serverError(err)
  }
}