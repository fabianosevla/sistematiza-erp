// @ts-nocheck
import type { NextRequest } from 'next/server'
import { z } from 'zod'
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
      const service    = new ProducaoService(db)
      const result     = await service.getGradeSemanal(dataInicio, dataFim)
      return ok(result)
    } finally {
      release()
    }
  } catch (err) {
    return serverError(err)
  }
}

const celulaSchema = z.object({
  produtoId:    z.number().int(),
  dataProducao: z.string(),
  quantidade:   z.number().int().min(0),
})

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const body    = await req.json()
      const payload = celulaSchema.parse(body)
      const service = new ProducaoService(db)
      const result  = await service.salvarCelula({ ...payload, userId: 1 })
      return ok(result)
    } finally {
      release()
    }
  } catch (err) {
    return serverError(err)
  }
}