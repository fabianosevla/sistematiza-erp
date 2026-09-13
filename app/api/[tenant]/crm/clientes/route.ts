// app/api/[tenant]/crm/clientes/route.ts — busca de cliente pra Ficha 360°
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
      // Sem termo (ou 1 letra só) já devolve uma lista — combobox de cliente
      // precisa mostrar todo mundo ao abrir, não só depois de digitar.
      const termo = new URL(req.url).searchParams.get('termo') ?? ''
      const resultados = await new Cliente360Service(db).buscar(termo.trim())
      return ok({ resultados })
    } finally { release() }
  } catch (err) { return serverError(err) }
}
