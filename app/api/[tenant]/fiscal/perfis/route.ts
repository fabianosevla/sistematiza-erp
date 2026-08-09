// @ts-nocheck
// ESTE ARQUIVO VAI EM: app/api/[tenant]/fiscal/perfis/route.ts
import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { usuarioAtualIdDb } from '@/lib/auth/usuarioAtual'
import { PerfilTributarioService } from '@/lib/services/fiscal/PerfilTributarioService'
import { ok, created, serverError, badRequest } from '@/lib/api/responses'

type Params = { params: { tenant: string } }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const service = new PerfilTributarioService(db)
      const [perfis, uso] = await Promise.all([service.list(), service.contagemPorPerfil()])
      return ok({ perfis, uso })
    } finally { release() }
  } catch (err) { return serverError(err) }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const body = await req.json()
      if (!String(body.nome ?? '').trim()) return badRequest('Informe o nome do perfil.')
      const userId = await usuarioAtualIdDb(db)
      return created(await new PerfilTributarioService(db).criar(body, userId))
    } finally { release() }
  } catch (err) { return serverError(err) }
}
