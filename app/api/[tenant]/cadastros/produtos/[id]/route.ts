// ESTE ARQUIVO VAI EM: app/api/[tenant]/cadastros/produtos/[id]/route.ts
import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { usuarioAtualIdDb } from '@/lib/auth/usuarioAtual'
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
      const uid     = await usuarioAtualIdDb(db)   // antes: literal 1
      const service = new ProdutoService(db)
      const result  = await service.update(Number(params.id), payload, uid)
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
      const uid     = await usuarioAtualIdDb(db)
      const service = new ProdutoService(db)
      await service.softDelete(Number(params.id), uid)
      return ok({ deleted: true })
    } finally {
      release()
    }
  } catch (err) {
    return serverError(err)
  }
}