import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { ImportacaoService, type EntidadeImportacao } from '@/lib/services/importacao/ImportacaoService'
import { ok, serverError, badRequest } from '@/lib/api/responses'

type Params = { params: { tenant: string } }

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const body     = await req.json()
      const entidade = body.entidade as EntidadeImportacao
      const rows     = body.rows as Record<string, string>[]

      if (!entidade || !rows?.length) return badRequest('Dados inválidos')

      const service = new ImportacaoService(db)
      const result  = await service.importar(entidade, rows, 1)
      return ok(result)
    } finally {
      release()
    }
  } catch (err) {
    return serverError(err)
  }
}