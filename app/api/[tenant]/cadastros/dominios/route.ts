// @ts-nocheck
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { DominiosService } from '@/lib/services/dominios/DominiosService'
import { ok, created, serverError } from '@/lib/api/responses'

type Params = { params: { tenant: string } }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try { return ok(await new DominiosService(db).listDominios()) }
    finally { release() }
  } catch (err) { return serverError(err) }
}

const schema = z.object({
  codigo:    z.string().min(2).max(50).regex(/^[a-z0-9_]+$/),
  nome:      z.string().min(2).max(100),
  descricao: z.string().max(300).optional(),
})

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const { codigo, nome, descricao } = schema.parse(await req.json())
      return created(await new DominiosService(db).criarDominio(codigo, nome, descricao, 1))
    } finally { release() }
  } catch (err) { return serverError(err) }
}