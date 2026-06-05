import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { ComandaService } from '@/lib/services/comandas/ComandaService'
import { ok, serverError } from '@/lib/api/responses'

type Params = { params: { tenant: string; id: string } }

const addItemSchema = z.object({
  produtoId:  z.number().int(),
  quantidade: z.number().int().min(1),
  observacao: z.string().max(200).optional(),
})

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const tenant  = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const body    = await req.json()
      const payload = addItemSchema.parse(body)
      const service = new ComandaService(db)
      const result  = await service.adicionarItem({
        comandaId: Number(params.id),
        ...payload,
        userId: 1,
      })
      return ok(result)
    } finally {
      release()
    }
  } catch (err) {
    return serverError(err)
  }
}