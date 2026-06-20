import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { LocalEstoqueService } from '@/lib/services/estoque/LocalEstoqueService'
import { ok, serverError } from '@/lib/api/responses'

type P = { params: { tenant: string } }

export async function GET(req: NextRequest, { params }: P) {
  try {
    const url    = new URL(req.url)
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const entidade   = url.searchParams.get('entidade') as 'produto' | 'insumo'
      const entidadeId = Number(url.searchParams.get('entidadeId') ?? 0)
      return ok(await new LocalEstoqueService(db).getDistribuicao(entidade, entidadeId))
    } finally { release() }
  } catch (err) { return serverError(err) }
}