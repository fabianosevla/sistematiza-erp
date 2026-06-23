import type { NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { dbUsuario } from '@/lib/db/schemas/cadastros'
import { ok, serverError, notFound } from '@/lib/api/responses'

type Params = { params: { tenant: string; id: string } }

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const id = Number(params.id)
      const [result] = await db
        .update(dbUsuario)
        .set({ activeFlag: false, updatedDt: new Date() })
        .where(eq(dbUsuario.usuarioId, id))
        .returning({ usuarioId: dbUsuario.usuarioId })
      if (!result) return notFound('Usuário não encontrado')
      return ok({ inativado: true })
    } finally {
      release()
    }
  } catch (err) {
    return serverError(err)
  }
}