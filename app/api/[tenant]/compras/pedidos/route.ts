// app/api/[tenant]/compras/pedidos/route.ts
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { PedidoCompraService } from '@/lib/services/compras/PedidoCompraService'
import { ok, created, serverError } from '@/lib/api/responses'

type P = { params: { tenant: string } }

export async function GET(req: NextRequest, { params }: P) {
  try {
    const url    = new URL(req.url)
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      return ok(await new PedidoCompraService(db).list({
        status: url.searchParams.get('status') ?? undefined,
      }))
    } finally { release() }
  } catch (err) { return serverError(err) }
}

const schema = z.object({
  listaId:         z.number().int().optional(),
  fornecedorId:    z.number().int().optional(),
  nomeFornecedor:  z.string().min(1),
  previsaoEntrega: z.string().optional(),
  observacao:      z.string().optional(),
  itens: z.array(z.object({
    insumoId:      z.number().int().optional(),
    nomeInsumo:    z.string(),
    quantidade:    z.number().positive(),
    precoUnitario: z.number().nonnegative(), // em reais — convertido abaixo
  })).min(1),
})

export async function POST(req: NextRequest, { params }: P) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const payload = schema.parse(await req.json())
      return created(await new PedidoCompraService(db).criar({
        ...payload,
        itens: payload.itens.map(i => ({ ...i, precoUnitario: Math.round(i.precoUnitario * 100) })),
        userId: 1,
      }))
    } finally { release() }
  } catch (err) { return serverError(err) }
}