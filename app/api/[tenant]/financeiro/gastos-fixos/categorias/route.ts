// @ts-nocheck
import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { exigirModulo } from '@/lib/auth/permissoes'
import { getDbForTenant } from '@/lib/db/connection'
import { dbGastoFixoCategoria } from '@/lib/db/schemas/financeiro'
import { ok, created, serverError } from '@/lib/api/responses'
import { desc } from 'drizzle-orm'

type Params = { params: { tenant: string } }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    await exigirModulo(tenant.schemaName, 'financeiro')
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const categorias = await db.select().from(dbGastoFixoCategoria).orderBy(dbGastoFixoCategoria.ordem)
      return ok(categorias)
    } finally { release() }
  } catch (err) { return serverError(err) }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    await exigirModulo(tenant.schemaName, 'financeiro')
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const body = await req.json()
      const { nome, ordem } = body
      if (!nome?.trim()) return serverError(new Error('Nome é obrigatório'))
      const now = new Date()
      const [result] = await db.insert(dbGastoFixoCategoria).values({
        nome:      nome.trim(),
        ordem:     ordem ?? 99,
        createdBy: 1, updatedBy: 1, createdDt: now, updatedDt: now,
      }).returning({ categoriaId: dbGastoFixoCategoria.categoriaId })
      return created(result)
    } finally { release() }
  } catch (err) { return serverError(err) }
}