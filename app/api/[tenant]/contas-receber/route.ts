// ════════════════════════════════════════════════════════
// app/api/[tenant]/contas-receber/route.ts
// ════════════════════════════════════════════════════════
import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { usuarioAtualIdDb } from '@/lib/auth/usuarioAtual'
import { ContasReceberService } from '@/lib/services/financeiro/ContasReceberService'
import { ok, created, serverError } from '@/lib/api/responses'

type P = { params: { tenant: string } }

export async function GET(req: NextRequest, { params }: P) {
  try {
    const url    = new URL(req.url)
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const svc  = new ContasReceberService(db)
      if (url.searchParams.get('tipo') === 'kpis') return ok(await svc.kpis())
      return ok(await svc.list({
        status:     url.searchParams.get('status') ?? undefined,
        dataInicio: url.searchParams.get('dataInicio') ?? undefined,
        dataFim:    url.searchParams.get('dataFim') ?? undefined,
        busca:      url.searchParams.get('busca') ?? undefined,
        page:       Number(url.searchParams.get('page') ?? 1),
        limit:      Number(url.searchParams.get('limit') ?? 20),
      }))
    } finally { release() }
  } catch (err) { return serverError(err) }
}

export async function POST(req: NextRequest, { params }: P) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const body   = await req.json()
      const userId = await usuarioAtualIdDb(db)
      const cent   = (v: any) => Math.round((Number(v) || 0) * 100)
      return created(await new ContasReceberService(db).criar({
        ...body,
        valorBase:     cent(body.valorBase ?? body.valorOriginal),
        desconto:      cent(body.desconto),
        acrescimo:     cent(body.acrescimo),
        valorOriginal: cent(body.valorOriginal),
      }, userId))
    } finally { release() }
  } catch (err) { return serverError(err) }
}

// ════════════════════════════════════════════════════════
// app/api/[tenant]/contas-receber/[id]/route.ts
// ════════════════════════════════════════════════════════
// (copie o mesmo padrão de contas-pagar-id-route.ts usando ContasReceberService)

// ════════════════════════════════════════════════════════
// app/api/[tenant]/contas-receber/[id]/baixar/route.ts
// ════════════════════════════════════════════════════════
// Igual ao baixar de contas-pagar, mas usa:
// new ContasReceberService(db).baixar(id, {
//   valorRecebido, dataRecebimento, formaRecebimento, contaBancariaId
// }, 1)