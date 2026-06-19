// app/api/[tenant]/contas-receber/[id]/route.ts
import type { NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { dbContaReceber } from '@/lib/db/schemas/financeiro-completo'
import { ContasReceberService } from '@/lib/services/financeiro/ContasReceberService'
import { ok, serverError } from '@/lib/api/responses'

type P = { params: { tenant: string; id: string } }

export async function PUT(req: NextRequest, { params }: P) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const body = await req.json()
      const [result] = await db.update(dbContaReceber).set({
        ...body,
        valorOriginal: body.valorOriginal !== undefined ? Math.round(body.valorOriginal * 100) : undefined,
        updatedDt: new Date(),
        updatedBy: 1,
      }).where(eq(dbContaReceber.contaReceberId, Number(params.id)))
        .returning({ id: dbContaReceber.contaReceberId })
      return ok(result)
    } finally { release() }
  } catch (err) { return serverError(err) }
}

export async function DELETE(req: NextRequest, { params }: P) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      return ok(await new ContasReceberService(db).excluir(Number(params.id), 1))
    } finally { release() }
  } catch (err) { return serverError(err) }
}