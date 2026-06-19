// app/api/[tenant]/compras/mrp/route.ts
import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { MrpService } from '@/lib/services/compras/MrpService'
import { ok, created, serverError } from '@/lib/api/responses'

type P = { params: { tenant: string } }

// GET /api/[tenant]/compras/mrp?dias=30&apenasAbaixoMinimo=true
export async function GET(req: NextRequest, { params }: P) {
  try {
    const url    = new URL(req.url)
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      return ok(await new MrpService(db).analisar({
        diasProjecao: Number(url.searchParams.get('dias') ?? 30),
        mostrarApenasAbaixoMinimo: url.searchParams.get('apenasAbaixoMinimo') === 'true',
      }))
    } finally { release() }
  } catch (err) { return serverError(err) }
}

// POST /api/[tenant]/compras/mrp — gera Lista de Compras a partir do MRP
export async function POST(req: NextRequest, { params }: P) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const body = await req.json()
      return created(await new MrpService(db).gerarLista(body.itens, 1, body.descricao))
    } finally { release() }
  } catch (err) { return serverError(err) }
}