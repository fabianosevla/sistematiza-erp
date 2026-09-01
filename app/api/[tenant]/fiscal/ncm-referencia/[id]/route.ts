// @ts-nocheck
// ESTE ARQUIVO VAI EM: app/api/[tenant]/fiscal/ncm-referencia/[id]/route.ts
import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { exigirModulo } from '@/lib/auth/permissoes'
import { getDbForTenant } from '@/lib/db/connection'
import { usuarioAtualIdDb } from '@/lib/auth/usuarioAtual'
import { NcmReferenciaService } from '@/lib/services/fiscal/NcmReferenciaService'
import { fiscalLigado } from '@/app/api/[tenant]/fiscal/perfis/route'
import { ok, forbidden, serverError, notFound } from '@/lib/api/responses'

type Params = { params: { tenant: string; id: string } }

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    await exigirModulo(tenant.schemaName, 'fiscal')
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      if (!(await fiscalLigado(db))) return forbidden()
      const body = await req.json()
      const userId = await usuarioAtualIdDb(db)
      const r = await new NcmReferenciaService(db).atualizar(Number(params.id), body, userId)
      if (!r) return notFound('Registro não encontrado')
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
      return ok(await new NcmReferenciaService(db).excluir(Number(params.id), userId))
    } finally { release() }
  } catch (err) { return serverError(err) }
}
