import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { exigirModulo } from '@/lib/auth/permissoes'
import { getDbForTenant } from '@/lib/db/connection'
import { PerdaEstoqueService } from '@/lib/services/estoque/PerdaEstoqueService'
import { ok, created, serverError } from '@/lib/api/responses'

type P = { params: { tenant: string } }

export async function GET(req: NextRequest, { params }: P) {
  try {
    const url    = new URL(req.url)
    const tenant = await resolveTenant(params.tenant)
    await exigirModulo(tenant.schemaName, 'estoque')
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      return ok(await new PerdaEstoqueService(db).list({
        entidade:   url.searchParams.get('entidade') ?? undefined,
        motivo:     url.searchParams.get('motivo') ?? undefined,
        dataInicio: url.searchParams.get('dataInicio') ?? undefined,
        dataFim:    url.searchParams.get('dataFim') ?? undefined,
      }))
    } finally { release() }
  } catch (err) { return serverError(err) }
}

export async function POST(req: NextRequest, { params }: P) {
  try {
    const tenant = await resolveTenant(params.tenant)
    await exigirModulo(tenant.schemaName, 'estoque')
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const body = await req.json()
      return created(await new PerdaEstoqueService(db).registrar({ ...body, userId: 1 }))
    } finally { release() }
  } catch (err) { return serverError(err) }
}