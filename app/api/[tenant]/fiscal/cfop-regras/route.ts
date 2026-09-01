// @ts-nocheck
// ESTE ARQUIVO VAI EM: app/api/[tenant]/fiscal/cfop-regras/route.ts
import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { exigirModulo } from '@/lib/auth/permissoes'
import { getDbForTenant } from '@/lib/db/connection'
import { usuarioAtualIdDb } from '@/lib/auth/usuarioAtual'
import { CfopRegraService } from '@/lib/services/fiscal/CfopRegraService'
import { fiscalLigado } from '@/app/api/[tenant]/fiscal/perfis/route'
import { ok, created, serverError, badRequest, forbidden } from '@/lib/api/responses'

type Params = { params: { tenant: string } }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      if (!(await fiscalLigado(db))) return forbidden()
      const regras = await new CfopRegraService(db).list()
      return ok({ regras })
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
      if (!String(body.tipoOperacao ?? '').trim()) return badRequest('Informe o tipo de operação.')
      if (!/^\d{4}$/.test(String(body.cfop ?? '').trim())) return badRequest('CFOP precisa ter 4 dígitos.')
      const userId = await usuarioAtualIdDb(db)
      return created(await new CfopRegraService(db).criar(body, userId))
    } finally { release() }
  } catch (err) { return serverError(err) }
}
