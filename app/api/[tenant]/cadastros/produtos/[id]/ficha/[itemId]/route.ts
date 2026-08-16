// @ts-nocheck
// ESTE ARQUIVO VAI EM: app/api/[tenant]/cadastros/produtos/[id]/ficha/[itemId]/route.ts
import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { exigirModulo } from '@/lib/auth/permissoes'
import { getDbForTenant } from '@/lib/db/connection'
import { usuarioAtualIdDb } from '@/lib/auth/usuarioAtual'
import { FichaTecnicaService } from '@/lib/services/cadastros/FichaTecnicaService'
import { ok, serverError } from '@/lib/api/responses'

type Params = { params: { tenant: string; id: string; itemId: string } }

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    await exigirModulo(tenant.schemaName, 'cadastros')
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const uid     = await usuarioAtualIdDb(db)   // antes: literal 1
      const service = new FichaTecnicaService(db)
      await service.removeItem(Number(params.itemId), uid)
      return ok({ deleted: true })
    } finally {
      release()
    }
  } catch (err) {
    return serverError(err)
  }
}