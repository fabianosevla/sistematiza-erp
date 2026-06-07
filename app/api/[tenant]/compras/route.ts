// @ts-nocheck
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { ComprasService } from '@/lib/services/compras/ComprasService'
import { ok, created, serverError } from '@/lib/api/responses'

type Params = { params: { tenant: string } }

const schema = z.object({
  nomeInsumo:     z.string().min(1),
  nomeFornecedor: z.string().optional(),
  dataEntrada:    z.string(),
  valorUnitario:  z.number().int().min(0),
  quantidade:     z.number().min(0),
  caixas:         z.number().int().min(0).default(0),
  qtdTotal:       z.number().min(0).optional(),
  status:         z.string().optional(),
  observacao:     z.string().optional(),
})

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const { searchParams } = new URL(req.url)
      return ok(await new ComprasService(db).list({ status: searchParams.get('status') ?? undefined }))
    } finally { release() }
  } catch (err) { return serverError(err) }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const payload = schema.parse(await req.json())
      return created(await new ComprasService(db).criar({ ...payload, userId: 1 }))
    } finally { release() }
  } catch (err) { return serverError(err) }
}