// @ts-nocheck
// ESTE ARQUIVO VAI EM: app/api/[tenant]/fiscal/cfop-regras/[id]/route.ts
import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { exigirModulo } from '@/lib/auth/permissoes'
import { getDbForTenant } from '@/lib/db/connection'
import { usuarioAtualIdDb } from '@/lib/auth/usuarioAtual'
import { CfopRegraService } from '@/lib/services/fiscal/CfopRegraService'
import { fiscalLigado } from '@/app/api/[tenant]/fiscal/perfis/route'
import { ok, forbidden, serverError, notFound, badRequest } from '@/lib/api/responses'

type Params = { params: { tenant: string; id: string } }

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    await exigirModulo(tenant.schemaName, 'fiscal')
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      if (!(await fiscalLigado(db))) return forbidden()
      const body = await req.json()
      if (!/^\d{4}$/.test(String(body.cfop ?? '').trim())) return badRequest('CFOP precisa ter 4 dígitos.')
      const userId = await usuarioAtualIdDb(db)
      const r = await new CfopRegraService(db).atualizar(Number(params.id), body, userId)
      if (!r) return notFound('Regra não encontrada')
      return ok(r)
    } finally { release() }
  } catch (err) { return serverError(err) }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    await exigirModulo(tenant.schemaName, 'fiscal')
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      if (!(await fiscalLigado(db))) return forbidden()
      const userId = await usuarioAtualIdDb(db)
      return ok(await new CfopRegraService(db).excluir(Number(params.id), userId))
    } finally { release() }
  } catch (err) { return serverError(err) }
}
