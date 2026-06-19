// ════════════════════════════════════════════════════════
// app/api/[tenant]/contas-pagar/[id]/baixar/route.ts
// ════════════════════════════════════════════════════════
import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { ContasPagarService } from '@/lib/services/financeiro/ContasPagarService'
import { ok, serverError } from '@/lib/api/responses'

type P = { params: { tenant: string; id: string } }

export async function POST(req: NextRequest, { params }: P) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const body = await req.json()
      return ok(await new ContasPagarService(db).baixar(Number(params.id), {
        valorPago:       Math.round((body.valorPago ?? 0) * 100),
        dataPagamento:   body.dataPagamento,
        formaPagamento:  body.formaPagamento,
        contaBancariaId: body.contaBancariaId,
      }, 1))
    } finally { release() }
  } catch (err) { return serverError(err) }
}