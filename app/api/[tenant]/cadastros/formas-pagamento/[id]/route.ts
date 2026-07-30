// @ts-nocheck
// ESTE ARQUIVO VAI EM: app/api/[tenant]/cadastros/formas-pagamento/[id]/route.ts
import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { usuarioAtualIdDb } from '@/lib/auth/usuarioAtual'
import { FormaPagamentoService } from '@/lib/services/cadastros/FormaPagamentoService'
import { ok, serverError, badRequest } from '@/lib/api/responses'

type Params = { params: { tenant: string; id: string } }

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const body = await req.json()
      if (!body.nome?.trim()) return badRequest('Nome é obrigatório')
      const uid     = await usuarioAtualIdDb(db)   // antes: literal 1
      const service = new FormaPagamentoService(db)
      await service.atualizar(Number(params.id), {
        nome:       body.nome.trim(),
        taxa:       Number(body.taxa ?? 0),
        observacao: body.observacao ?? undefined,
        userId:     uid,
      })
      return ok({ updated: true })
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
      const service = new FormaPagamentoService(db)
      await service.excluir(Number(params.id), uid)
      return ok({ deleted: true })
    } finally {
      release()
    }
  } catch (err) {
    return serverError(err)
  }
}