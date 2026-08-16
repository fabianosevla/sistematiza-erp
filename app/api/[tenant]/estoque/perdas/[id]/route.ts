import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { exigirModulo } from '@/lib/auth/permissoes'
import { getDbForTenant } from '@/lib/db/connection'
import { PerdaEstoqueService } from '@/lib/services/estoque/PerdaEstoqueService'
import { ok, serverError } from '@/lib/api/responses'

type P = { params: { tenant: string; id: string } }

export async function DELETE(req: NextRequest, { params }: P) {
  try {
    const tenant = await resolveTenant(params.tenant)
    await exigirModulo(tenant.schemaName, 'estoque')
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      return ok(await new PerdaEstoqueService(db).excluir(Number(params.id), 1))
    } finally { release() }
  } catch (err) { return serverError(err) }
}