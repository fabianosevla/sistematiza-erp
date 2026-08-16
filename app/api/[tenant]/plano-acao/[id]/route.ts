// @ts-nocheck
import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { exigirModulo } from '@/lib/auth/permissoes'
import { getDbForTenant } from '@/lib/db/connection'
import { usuarioAtualIdDb } from '@/lib/auth/usuarioAtual'
import { PlanoAcaoService } from '@/lib/services/plano_acao/PlanoAcaoService'
import { ok, serverError } from '@/lib/api/responses'

type Params = { params: { tenant: string; id: string } }

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    await exigirModulo(tenant.schemaName, 'planoAcao')
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const body    = await req.json()
      const userId  = await usuarioAtualIdDb(db)
      const service = new PlanoAcaoService(db)
      if (body.action === 'concluir') return ok(await service.concluir(Number(params.id), userId))
      if (body.action === 'reabrir')  return ok(await service.reabrir(Number(params.id), userId))
      return ok(await service.atualizar(Number(params.id), { ...body, userId }))
    } finally { release() }
  } catch (err) { return serverError(err) }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    await exigirModulo(tenant.schemaName, 'planoAcao')
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const userId = await usuarioAtualIdDb(db)
      return ok(await new PlanoAcaoService(db).excluir(Number(params.id), userId))
    } finally { release() }
  } catch (err) { return serverError(err) }
}