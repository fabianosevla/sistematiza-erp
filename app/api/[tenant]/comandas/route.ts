import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { ComandaService } from '@/lib/services/comandas/ComandaService'
import { ok, created, serverError } from '@/lib/api/responses'

type Params = { params: { tenant: string } }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const { searchParams } = new URL(req.url)
      const status = searchParams.get('status') ?? undefined
      const service = new ComandaService(db)
      const result  = await service.list({ status })
      return ok(result)
    } finally {
      release()
    }
  } catch (err) {
    return serverError(err)
  }
}

const criarSchema = z.object({
  identificacao: z.string().min(1).max(100),
  clienteId:     z.number().int().optional(),
})

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const tenant  = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const body    = await req.json()
      const payload = criarSchema.parse(body)
      const service = new ComandaService(db)
      const result  = await service.criar({ ...payload, userId: 1 })
      return created(result)
    } finally {
      release()
    }
  } catch (err) {
    return serverError(err)
  }
}