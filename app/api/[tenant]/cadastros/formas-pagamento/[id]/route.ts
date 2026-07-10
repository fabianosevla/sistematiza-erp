// @ts-nocheck
// ESTE ARQUIVO VAI EM: app/api/[tenant]/cadastros/formas-pagamento/[id]/route.ts
import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
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
      const service = new FormaPagamentoService(db)
      await service.atualizar(Number(params.id), {
        nome:       body.nome.trim(),
        taxa:       Number(body.taxa ?? 0),
        observacao: body.observacao ?? undefined,
        userId:     1,
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
      const service = new FormaPagamentoService(db)
      await service.excluir(Number(params.id), 1)
      return ok({ deleted: true })
    } finally {
      release()
    }
  } catch (err) {
    return serverError(err)
  }
}