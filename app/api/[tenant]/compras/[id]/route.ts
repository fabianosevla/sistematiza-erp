// @ts-nocheck
// ESTE ARQUIVO VAI EM: app/api/[tenant]/compras/[id]/route.ts
//
// Cancelamento. Inativa a compra e o lancamento financeiro que ela gerou;
// nao mexe no estoque (ver comentario em ComprasService.cancelar).
import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { exigirModulo } from '@/lib/auth/permissoes'
import { getDbForTenant } from '@/lib/db/connection'
import { usuarioAtualIdDb } from '@/lib/auth/usuarioAtual'
import { ComprasService } from '@/lib/services/compras/ComprasService'
import { ok, serverError } from '@/lib/api/responses'

type Params = { params: { tenant: string; id: string } }

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    await exigirModulo(tenant.schemaName, 'compras')
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const userId = await usuarioAtualIdDb(db)
      return ok(await new ComprasService(db).cancelar(Number(params.id), userId))
    } finally { release() }
  } catch (err) { return serverError(err) }
}
