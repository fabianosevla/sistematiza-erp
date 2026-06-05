import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { produtoInsertSchema } from '@/lib/validations/cadastros'
import { ProdutoService } from '@/lib/services/cadastros/ProdutoService'
import { ok, created, serverError } from '@/lib/api/responses'

type Params = { params: { tenant: string } }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const { searchParams } = new URL(req.url)
      const page   = Math.max(1, Number(searchParams.get('page') ?? 1))
      const limit  = Math.min(100, Math.max(1, Number(searchParams.get('limit') ?? 20)))
      const search = searchParams.get('search') ?? undefined
      const service = new ProdutoService(db)
      const result  = await service.list({ page, limit, search })
      return ok(result)
    } finally {
      release()
    }
  } catch (err) {
    return serverError(err)
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const body    = await req.json()
      const payload = produtoInsertSchema.parse(body)
      const service = new ProdutoService(db)
      const result  = await service.create(payload, 1)
      return created(result)
    } finally {
      release()
    }
  } catch (err) {
    return serverError(err)
  }
}