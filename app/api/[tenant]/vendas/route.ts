// @ts-nocheck
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { VendaService } from '@/lib/services/vendas/VendaService'
import { ok, created, serverError } from '@/lib/api/responses'

type Params = { params: { tenant: string } }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const { searchParams } = new URL(req.url)
      const page       = Math.max(1, Number(searchParams.get('page') ?? 1))
      const limit      = Math.min(100, Math.max(1, Number(searchParams.get('limit') ?? 20)))
      const dataInicio = searchParams.get('dataInicio') ?? undefined
      const dataFim    = searchParams.get('dataFim') ?? undefined
      const origem     = searchParams.get('origem') ?? undefined
      const kpis       = searchParams.get('kpis') === 'true'

      const service = new VendaService(db)

      if (kpis) {
        const result = await service.kpis()
        return ok(result)
      }

      const result = await service.list({ page, limit, dataInicio, dataFim, origem })
      return ok(result)
    } finally {
      release()
    }
  } catch (err) {
    return serverError(err)
  }
}

const criarVendaSchema = z.object({
  itens: z.array(z.object({
    produtoId:  z.number().int(),
    quantidade: z.number().int().min(1),
  })).min(1),
  clienteId:  z.number().int().optional(),
  desconto:   z.number().int().default(0),
  pagamentos: z.array(z.object({
    forma: z.string(),
    valor: z.number().int(),
  })).min(1),
})

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const body    = await req.json()
      const payload = criarVendaSchema.parse(body)
      const service = new VendaService(db)
      const result  = await service.criarDireta({ ...payload, userId: 1 })
      return created(result)
    } finally {
      release()
    }
  } catch (err) {
    return serverError(err)
  }
}