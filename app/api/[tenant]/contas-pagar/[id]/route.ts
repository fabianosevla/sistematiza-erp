// ════════════════════════════════════════════════════════
// app/api/[tenant]/contas-pagar/[id]/route.ts
// ════════════════════════════════════════════════════════
import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { exigirModulo } from '@/lib/auth/permissoes'
import { getDbForTenant } from '@/lib/db/connection'
import { ContasPagarService } from '@/lib/services/financeiro/ContasPagarService'
import { ok, serverError } from '@/lib/api/responses'

type P = { params: { tenant: string; id: string } }

export async function PUT(req: NextRequest, { params }: P) {
  try {
    const tenant = await resolveTenant(params.tenant)
    await exigirModulo(tenant.schemaName, 'financeiro')
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const body = await req.json()
      return ok(await new ContasPagarService(db).atualizar(Number(params.id), body, 1))
    } finally { release() }
  } catch (err) { return serverError(err) }
}

export async function DELETE(req: NextRequest, { params }: P) {
  try {
    const tenant = await resolveTenant(params.tenant)
    await exigirModulo(tenant.schemaName, 'financeiro')
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      return ok(await new ContasPagarService(db).excluir(Number(params.id), 1))
    } finally { release() }
  } catch (err) { return serverError(err) }
}