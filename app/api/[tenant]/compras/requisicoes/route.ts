// app/api/[tenant]/compras/requisicoes/route.ts
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { RequisicaoService } from '@/lib/services/compras/RequisicaoService'
import { ok, created, serverError } from '@/lib/api/responses'

type P = { params: { tenant: string } }

export async function GET(req: NextRequest, { params }: P) {
  try {
    const url    = new URL(req.url)
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      return ok(await new RequisicaoService(db).list({
        status: url.searchParams.get('status') ?? undefined,
      }))
    } finally { release() }
  } catch (err) { return serverError(err) }
}

const schema = z.object({
  dataEntrega:        z.string().optional(),
  motivo:             z.string().max(300).optional(),
  prioridade:         z.enum(['baixa', 'normal', 'alta', 'urgente']).default('normal'),
  departamento:       z.string().max(100).optional(),
  usuarioSolicitante: z.string().max(100).optional(),
  itens: z.array(z.object({
    insumoId:   z.number().int(),
    nomeInsumo: z.string(),
    quantidade: z.number().positive(),
    unidade:    z.string().optional(),
    observacao: z.string().optional(),
  })).min(1),
})

export async function POST(req: NextRequest, { params }: P) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const payload = schema.parse(await req.json())
      return created(await new RequisicaoService(db).criar({ ...payload, userId: 1 }))
    } finally { release() }
  } catch (err) { return serverError(err) }
}