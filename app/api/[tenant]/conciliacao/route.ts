// app/api/[tenant]/conciliacao/route.ts
import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { ConciliacaoService } from '@/lib/services/financeiro/ConciliacaoService'
import { ok, created, serverError } from '@/lib/api/responses'

type P  = { params: { tenant: string } }
type PI = { params: { tenant: string; id: string } }

// GET /api/[tenant]/conciliacao?tipo=contas&contaId=1
// GET /api/[tenant]/conciliacao?tipo=extrato&contaId=1&status=pendente
export async function GET(req: NextRequest, { params }: P) {
  try {
    const url    = new URL(req.url)
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const svc    = new ConciliacaoService(db)
      const tipo   = url.searchParams.get('tipo')
      const contaId = Number(url.searchParams.get('contaId') ?? 0)

      if (tipo === 'contas')  return ok(await svc.listContas())
      if (tipo === 'kpis' && contaId) return ok(await svc.kpisExtrato(contaId))
      if (tipo === 'extrato' && contaId) {
        return ok(await svc.listExtrato(contaId, {
          status: url.searchParams.get('status') ?? undefined,
          page:   Number(url.searchParams.get('page') ?? 1),
          limit:  Number(url.searchParams.get('limit') ?? 50),
        }))
      }
      return ok(await svc.listContas())
    } finally { release() }
  } catch (err) { return serverError(err) }
}

// POST /api/[tenant]/conciliacao — criar conta bancária ou importar OFX
export async function POST(req: NextRequest, { params }: P) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const body = await req.json()
      const svc  = new ConciliacaoService(db)

      if (body.tipo === 'importar-ofx') {
        return ok(await svc.importarOFX(body.contaBancariaId, body.conteudoOFX, 1))
      }
      if (body.tipo === 'criar-conta') {
        return created(await svc.criarConta(body, 1))
      }
      return serverError(new Error('tipo inválido'))
    } finally { release() }
  } catch (err) { return serverError(err) }
}