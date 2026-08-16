// @ts-nocheck
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { resolveTenant } from '@/lib/auth/tenant'
import { exigirModulo } from '@/lib/auth/permissoes'
import { getDbForTenant } from '@/lib/db/connection'
import { DominiosService } from '@/lib/services/dominios/DominiosService'
import { ok, serverError } from '@/lib/api/responses'

type Params = { params: { tenant: string; codigo: string; id: string } }

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    await exigirModulo(tenant.schemaName, 'cadastros')
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const { valor } = z.object({ valor: z.string().min(1).max(100) }).parse(await req.json())
      return ok(await new DominiosService(db).updateValor(Number(params.id), valor.trim()))
    } finally { release() }
  } catch (err) { return serverError(err) }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    await exigirModulo(tenant.schemaName, 'cadastros')
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      return ok(await new DominiosService(db).deleteValor(Number(params.id)))
    } finally { release() }
  } catch (err) { return serverError(err) }
}