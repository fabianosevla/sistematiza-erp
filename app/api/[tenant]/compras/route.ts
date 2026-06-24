// @ts-nocheck
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { ComprasService } from '@/lib/services/compras/ComprasService'
import { ok, created, serverError, badRequest } from '@/lib/api/responses'

type Params = { params: { tenant: string } }

const schema = z.object({
  insumoId:       z.number().int().optional(),
  nomeInsumo:     z.string().min(1),
  fornecedorId:   z.number().int().optional(),
  nomeFornecedor: z.string().optional(),
  dataEntrada:    z.string(),
  valorUnitario:  z.number().min(0),
  quantidade:     z.number().min(0),
  caixas:         z.number().int().min(0).default(0),
  qtdTotal:       z.number().min(0).optional(),
  observacao:     z.string().optional(),
})

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const { searchParams } = new URL(req.url)
      return ok(await new ComprasService(db, tenant.schemaName).list({
        status: searchParams.get('status') ?? undefined,
      }))
    } finally { release() }
  } catch (err) { return serverError(err) }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const body   = await req.json()

    let payload: z.infer<typeof schema>
    try {
      payload = schema.parse(body)
    } catch (zodErr: any) {
      return badRequest('Dados inválidos: ' + JSON.stringify(zodErr.errors))
    }

    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const result = await new ComprasService(db, tenant.schemaName).criar({
        ...payload,
        userId: 1,
      })
      return created(result)
    } finally { release() }
  } catch (err) { return serverError(err) }
}