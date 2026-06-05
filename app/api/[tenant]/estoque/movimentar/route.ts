import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { EstoqueService } from '@/lib/services/estoque/EstoqueService'
import { ok, serverError } from '@/lib/api/responses'

type Params = { params: { tenant: string } }

const movimentarSchema = z.object({
  entidade:    z.enum(['produto', 'insumo']),
  entidadeId:  z.number().int(),
  tipo:        z.enum(['entrada', 'saida', 'ajuste']),
  quantidade:  z.number().int().min(1),
  precoCusto:  z.number().int().optional(),
  observacao:  z.string().max(500).optional(),
})

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const tenant  = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const body    = await req.json()
      const payload = movimentarSchema.parse(body)
      const service = new EstoqueService(db)
      const result  = await service.movimentar({ ...payload, userId: 1 })
      return ok(result)
    } finally {
      release()
    }
  } catch (err) {
    return serverError(err)
  }
}