// @ts-nocheck
import type { NextRequest } from 'next/server'
import { sql } from 'drizzle-orm'
import { resolveTenant } from '@/lib/auth/tenant'
import { exigirAdmin } from '@/lib/auth/permissoes'
import { getDbForTenant } from '@/lib/db/connection'
import { ok, serverError } from '@/lib/api/responses'

type Params = { params: { tenant: string } }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const result = await db.execute(sql`SELECT logo_base64 FROM t_configuracoes_tenant WHERE active_flg = true LIMIT 1`)
      return ok({ logo: result.rows[0]?.logo_base64 ?? null })
    } finally { release() }
  } catch (err) { return serverError(err) }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    // Trocar a logo é ação de Configurações — mesmo critério do resto da tela.
    await exigirAdmin(tenant.schemaName)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const { logo } = await req.json()
      await db.execute(sql`UPDATE t_configuracoes_tenant SET logo_base64 = ${logo}, updated_dt = NOW() WHERE active_flg = true`)
      return ok({ ok: true })
    } finally { release() }
  } catch (err) { return serverError(err) }
}