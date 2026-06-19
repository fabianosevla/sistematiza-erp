// app/api/[tenant]/compras/listas/route.ts
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { ListaComprasService } from '@/lib/services/compras/ListaComprasService'
import { ok, created, serverError } from '@/lib/api/responses'

type P = { params: { tenant: string } }

export async function GET(req: NextRequest, { params }: P) {
  try {
    const url    = new URL(req.url)
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      return ok(await new ListaComprasService(db).list({
        status: url.searchParams.get('status') ?? undefined,
      }))
    } finally { release() }
  } catch (err) { return serverError(err) }
}

const schema = z.object({
  descricao:         z.string().optional(),
  previsaoEntrega:   z.string().optional(),
  previsaoPagamento: z.string().optional(),
  itens: z.array(z.object({
    insumoId:           z.number().int(),
    nomeInsumo:         z.string(),
    quantidadeSugerida: z.number().nonnegative(),
    estoqueNoMomento:   z.number().nonnegative().optional(),
  })).min(1),
})

export async function POST(req: NextRequest, { params }: P) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const payload = schema.parse(await req.json())
      return created(await new ListaComprasService(db).criar({ ...payload, userId: 1 }))
    } finally { release() }
  } catch (err) { return serverError(err) }
}