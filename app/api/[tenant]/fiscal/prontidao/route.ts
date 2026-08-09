// @ts-nocheck
// ESTE ARQUIVO VAI EM: app/api/[tenant]/fiscal/prontidao/route.ts
//
// Diagnóstico do que falta para a empresa emitir nota. Alimenta a tela de
// implantação fiscal e é o que o time de suporte olha primeiro quando um
// cliente diz que "a nota não sai".
import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { ProntidaoFiscalService } from '@/lib/services/fiscal/ProntidaoFiscalService'
import { fiscalLigado } from '@/app/api/[tenant]/fiscal/perfis/route'
import { ok, forbidden, serverError } from '@/lib/api/responses'

type Params = { params: { tenant: string } }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      if (!(await fiscalLigado(db))) return forbidden()
      return ok(await new ProntidaoFiscalService(db).verificar())
    } finally { release() }
  } catch (err) { return serverError(err) }
}
