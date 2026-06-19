// app/api/[tenant]/contas-receber/[id]/baixar/route.ts
import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { ContasReceberService } from '@/lib/services/financeiro/ContasReceberService'
import { ok, serverError } from '@/lib/api/responses'

type P = { params: { tenant: string; id: string } }

export async function POST(req: NextRequest, { params }: P) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const body = await req.json()
      return ok(await new ContasReceberService(db).baixar(Number(params.id), {
        valorRecebido:    Math.round((body.valorRecebido ?? 0) * 100),
        dataRecebimento:  body.dataRecebimento,
        formaRecebimento: body.formaRecebimento,
        contaBancariaId:  body.contaBancariaId,
      }, 1))
    } finally { release() }
  } catch (err) { return serverError(err) }
}