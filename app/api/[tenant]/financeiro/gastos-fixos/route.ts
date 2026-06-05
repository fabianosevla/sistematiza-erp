// @ts-nocheck
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { GastosFixosService } from '@/lib/services/financeiro/GastosFixosService'
import { ok, created, serverError } from '@/lib/api/responses'

type Params = { params: { tenant: string } }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const { searchParams } = new URL(req.url)
      const ano     = Number(searchParams.get('ano') ?? new Date().getFullYear())
      const service = new GastosFixosService(db)
      return ok(await service.getGrade(ano))
    } finally { release() }
  } catch (err) { return serverError(err) }
}

const salvarSchema = z.object({
  categoriaId: z.number().int(),
  ano:         z.number().int(),
  mes:         z.number().int().min(1).max(12),
  valor:       z.number().int().min(0),
})

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const body    = await req.json()
      const { searchParams } = new URL(req.url)

      const service = new GastosFixosService(db)

      if (searchParams.get('action') === 'nova-categoria') {
        return created(await service.criarCategoria(body.nome, 1))
      }

      const payload = salvarSchema.parse(body)
      return ok(await service.salvarValor({ ...payload, userId: 1 }))
    } finally { release() }
  } catch (err) { return serverError(err) }
}