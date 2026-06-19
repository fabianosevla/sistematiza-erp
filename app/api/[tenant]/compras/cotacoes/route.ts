// app/api/[tenant]/compras/cotacoes/route.ts
import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { CotacaoService } from '@/lib/services/compras/CotacaoService'
import { ok, created, serverError } from '@/lib/api/responses'

type P = { params: { tenant: string } }

// GET /api/[tenant]/compras/cotacoes?listaId=X
export async function GET(req: NextRequest, { params }: P) {
  try {
    const url    = new URL(req.url)
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const listaId = Number(url.searchParams.get('listaId') ?? 0)
      return ok(await new CotacaoService(db).findByLista(listaId))
    } finally { release() }
  } catch (err) { return serverError(err) }
}

// POST /api/[tenant]/compras/cotacoes — body: { listaId }
export async function POST(req: NextRequest, { params }: P) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const { listaId } = await req.json()
      return created(await new CotacaoService(db).criarDeLista(listaId, 1))
    } finally { release() }
  } catch (err) { return serverError(err) }
}