// app/api/[tenant]/crm/cardapio-analise/route.ts
import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { exigirModulo } from '@/lib/auth/permissoes'
import { getDbForTenant } from '@/lib/db/connection'
import { CardapioAnaliticaService } from '@/lib/services/crm/CardapioAnaliticaService'
import { ok, serverError } from '@/lib/api/responses'

type Params = { params: { tenant: string } }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    await exigirModulo(tenant.schemaName, 'crm')
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const dias = Number(new URL(req.url).searchParams.get('dias') ?? 14)
      return ok(await new CardapioAnaliticaService(db).funilDiario(dias))
    } finally { release() }
  } catch (err) { return serverError(err) }
}
