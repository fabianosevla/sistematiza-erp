// app/api/[tenant]/crm/clientes-lista/route.ts
//
// Tabela de clientes paginada da Visão Geral do CRM — rota separada de
// /crm/clientes (busca da Ficha 360°) porque essa aqui pagina de verdade,
// pensada pra crescer, e devolve resumo de compra por linha.
import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { exigirModulo } from '@/lib/auth/permissoes'
import { getDbForTenant } from '@/lib/db/connection'
import { Cliente360Service } from '@/lib/services/crm/Cliente360Service'
import { ok, serverError } from '@/lib/api/responses'

type Params = { params: { tenant: string } }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    await exigirModulo(tenant.schemaName, 'crm')
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const { searchParams } = new URL(req.url)
      const page   = Math.max(1, Number(searchParams.get('page') ?? 1))
      const limit  = Math.min(100, Math.max(1, Number(searchParams.get('limit') ?? 20)))
      const search = searchParams.get('search') ?? undefined
      return ok(await new Cliente360Service(db).listarComResumo({ page, limit, search }))
    } finally { release() }
  } catch (err) { return serverError(err) }
}
