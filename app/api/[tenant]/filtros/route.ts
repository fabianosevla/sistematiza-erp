// @ts-nocheck
import type { NextRequest } from 'next/server'
import { sql } from 'drizzle-orm'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { ok, created, serverError } from '@/lib/api/responses'

type Params = { params: { tenant: string } }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const { searchParams } = new URL(req.url)
      const modulo = searchParams.get('modulo')
      const result = await db.execute(sql`
        SELECT filtro_id, modulo, nome, filtros, created_dt
        FROM t_filtro_salvo
        WHERE active_flg = true ${modulo ? sql`AND modulo = ${modulo}` : sql``}
        ORDER BY nome ASC
      `)
      return ok(result.rows)
    } finally { release() }
  } catch (err) { return serverError(err) }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const { modulo, nome, filtros } = await req.json()
      const result = await db.execute(sql`
        INSERT INTO t_filtro_salvo (modulo, nome, filtros)
        VALUES (${modulo}, ${nome}, ${JSON.stringify(filtros)}::jsonb)
        RETURNING filtro_id
      `)
      return created(result.rows[0])
    } finally { release() }
  } catch (err) { return serverError(err) }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const { searchParams } = new URL(req.url)
      const id = searchParams.get('id')
      await db.execute(sql`UPDATE t_filtro_salvo SET active_flg = false WHERE filtro_id = ${Number(id)}`)
      return ok({ ok: true })
    } finally { release() }
  } catch (err) { return serverError(err) }
}