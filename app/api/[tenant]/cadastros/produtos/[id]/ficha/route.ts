// @ts-nocheck
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { FichaTecnicaService } from '@/lib/services/cadastros/FichaTecnicaService'
import { ok, created, serverError } from '@/lib/api/responses'

type Params = { params: { tenant: string; id: string } }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const service = new FichaTecnicaService(db)
      const result  = await service.getByProduto(Number(params.id))
      const custo   = await service.calcularCusto(Number(params.id))
      return ok({ itens: result, custoProdução: custo })
    } finally {
      release()
    }
  } catch (err) {
    return serverError(err)
  }
}

const addItemSchema = z.object({
  insumoId:   z.number().int(),
  quantidade: z.number().positive(),
  unidade:    z.string().max(20),
  observacao: z.string().max(200).optional(),
})

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const body    = await req.json()
      const payload = addItemSchema.parse(body)
      const service = new FichaTecnicaService(db)
      const result  = await service.addItem({ produtoId: Number(params.id), ...payload, userId: 1 })
      return created(result)
    } finally {
      release()
    }
  } catch (err) {
    return serverError(err)
  }
}