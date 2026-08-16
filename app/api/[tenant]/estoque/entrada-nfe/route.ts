import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { exigirModulo } from '@/lib/auth/permissoes'
import { getDbForTenant } from '@/lib/db/connection'
import { EntradaNfeService } from '@/lib/services/estoque/EntradaNfeService'
import { ok, created, serverError } from '@/lib/api/responses'

type P = { params: { tenant: string } }

export async function GET(req: NextRequest, { params }: P) {
  try {
    const url    = new URL(req.url)
    const tenant = await resolveTenant(params.tenant)
    await exigirModulo(tenant.schemaName, 'estoque')
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      return ok(await new EntradaNfeService(db).list({
        status: url.searchParams.get('status') ?? undefined,
      }))
    } finally { release() }
  } catch (err) { return serverError(err) }
}

// body: { xmlContent: string } — o conteúdo bruto do arquivo XML
export async function POST(req: NextRequest, { params }: P) {
  try {
    const tenant = await resolveTenant(params.tenant)
    await exigirModulo(tenant.schemaName, 'estoque')
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const { xmlContent } = await req.json()
      const svc    = new EntradaNfeService(db)
      const parsed = svc.parseXml(xmlContent)
      return created(await svc.criar(parsed, 1))
    } finally { release() }
  } catch (err) { return serverError(err) }
}