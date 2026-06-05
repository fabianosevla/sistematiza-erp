// @ts-nocheck
import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { ProducaoService } from '@/lib/services/producao/ProducaoService'
import { ok, serverError } from '@/lib/api/responses'

type Params = { params: { tenant: string } }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const { searchParams } = new URL(req.url)
      const dataInicio = searchParams.get('dataInicio') ?? new Date().toISOString().slice(0, 10)
      const dataFim    = searchParams.get('dataFim')    ?? new Date().toISOString().slice(0, 10)
      return ok(await new ProducaoService(db).getPrevisaoInsumos(dataInicio, dataFim))
    } finally { release() }
  } catch (err) { return serverError(err) }
}