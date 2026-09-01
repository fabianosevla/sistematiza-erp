// @ts-nocheck
// ESTE ARQUIVO VAI EM: app/api/[tenant]/fiscal/icms-st-uf/route.ts
import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { exigirModulo } from '@/lib/auth/permissoes'
import { getDbForTenant } from '@/lib/db/connection'
import { usuarioAtualIdDb } from '@/lib/auth/usuarioAtual'
import { IcmsStUfService } from '@/lib/services/fiscal/IcmsStUfService'
import { fiscalLigado } from '@/app/api/[tenant]/fiscal/perfis/route'
import { ok, created, serverError, badRequest, forbidden } from '@/lib/api/responses'

type Params = { params: { tenant: string } }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      if (!(await fiscalLigado(db))) return forbidden()
      const { searchParams } = new URL(req.url)
      const perfilTribId = searchParams.get('perfilTribId')
      const linhas = await new IcmsStUfService(db).list(perfilTribId ? Number(perfilTribId) : undefined)
      return ok({ linhas })
    } finally { release() }
  } catch (err) { return serverError(err) }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    await exigirModulo(tenant.schemaName, 'fiscal')
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      if (!(await fiscalLigado(db))) return forbidden()
      const body = await req.json()
      if (!body.perfilTribId) return badRequest('Escolha o perfil tributário.')
      if (!/^[A-Za-z]{2}$/.test(String(body.ufDestino ?? ''))) return badRequest('Estado inválido.')
      const userId = await usuarioAtualIdDb(db)
      return created(await new IcmsStUfService(db).criar(body, userId))
    } finally { release() }
  } catch (err: any) {
    if (err?.code === '23505') return badRequest('Já existe um valor cadastrado para este perfil e estado.')
    return serverError(err)
  }
}
