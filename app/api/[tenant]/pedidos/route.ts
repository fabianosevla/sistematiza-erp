// @ts-nocheck
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { PedidoService } from '@/lib/services/producao/PedidoService'
import { ok, created, serverError } from '@/lib/api/responses'

type Params = { params: { tenant: string } }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const { searchParams } = new URL(req.url)
      const status  = searchParams.get('status') ?? undefined
      const service = new PedidoService(db)
      const result  = await service.list({ status })
      return ok(result)
    } finally {
      release()
    }
  } catch (err) {
    return serverError(err)
  }
}

const criarPedidoSchema = z.object({
  clienteId:        z.number().int().optional(),
  tipoVenda:        z.enum(['balcao', 'entrega']).default('entrega'),
  dataPedido:       z.string(),
  previsaoProducao: z.string().optional(),
  previsaoEntrega:  z.string().optional(),
  valorEntrega:     z.number().int().default(0),
  enderecoEntrega:  z.string().max(300).optional(),
  observacao:       z.string().max(500).optional(),
  itens: z.array(z.object({
    produtoId:     z.number().int(),
    quantidade:    z.number().int().min(1),
    precoUnitario: z.number().int().default(0),
  })).min(1),
})

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const body    = await req.json()
      const payload = criarPedidoSchema.parse(body)
      const service = new PedidoService(db)
      const result  = await service.criar({ ...payload, userId: 1 })
      return created(result)
    } finally {
      release()
    }
  } catch (err) {
    return serverError(err)
  }
}