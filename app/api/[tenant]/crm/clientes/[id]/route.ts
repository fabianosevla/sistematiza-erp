// app/api/[tenant]/crm/clientes/[id]/route.ts — Ficha 360° de um cliente
import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { exigirModulo } from '@/lib/auth/permissoes'
import { getDbForTenant } from '@/lib/db/connection'
import { Cliente360Service } from '@/lib/services/crm/Cliente360Service'
import { ok, notFound, serverError } from '@/lib/api/responses'

type Params = { params: { tenant: string; id: string } }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    await exigirModulo(tenant.schemaName, 'crm')
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const ficha = await new Cliente360Service(db).ficha(Number(params.id))
      if (!ficha) return notFound('Cliente não encontrado')
      return ok(ficha)
    } finally { release() }
  } catch (err) { return serverError(err) }
}
