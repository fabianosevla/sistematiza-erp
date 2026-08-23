// ════════════════════════════════════════════════════════
// app/api/[tenant]/contas-pagar/route.ts
// ════════════════════════════════════════════════════════
import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { exigirModulo } from '@/lib/auth/permissoes'
import { getDbForTenant } from '@/lib/db/connection'
import { ContasPagarService } from '@/lib/services/financeiro/ContasPagarService'
import { ok, created, serverError } from '@/lib/api/responses'

type P = { params: { tenant: string } }

export async function GET(req: NextRequest, { params }: P) {
  try {
    const url    = new URL(req.url)
    const tenant = await resolveTenant(params.tenant)
    await exigirModulo(tenant.schemaName, 'financeiro')
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const tipo = url.searchParams.get('tipo')
      const svc  = new ContasPagarService(db)
      if (tipo === 'kpis') return ok(await svc.kpis())
      return ok(await svc.list({
        status:     url.searchParams.get('status') ?? undefined,
        dataInicio: url.searchParams.get('dataInicio') ?? undefined,
        dataFim:    url.searchParams.get('dataFim') ?? undefined,
        busca:      url.searchParams.get('busca') ?? undefined,
        page:       Number(url.searchParams.get('page') ?? 1),
        limit:      Number(url.searchParams.get('limit') ?? 20),
        sort:       url.searchParams.get('sort') ?? undefined,
        dir:        (url.searchParams.get('dir') === 'asc' ? 'asc' : 'desc'),
      }))
    } finally { release() }
  } catch (err) { return serverError(err) }
}

export async function POST(req: NextRequest, { params }: P) {
  try {
    const tenant = await resolveTenant(params.tenant)
    await exigirModulo(tenant.schemaName, 'financeiro')
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const body = await req.json()
      return created(await new ContasPagarService(db).criar({
        ...body,
        valorOriginal: Math.round((body.valorOriginal ?? 0) * 100),
      }, 1))
    } finally { release() }
  } catch (err) { return serverError(err) }
}