// app/api/[tenant]/crm/leads/route.ts — funil B2B
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { resolveTenant } from '@/lib/auth/tenant'
import { exigirModulo } from '@/lib/auth/permissoes'
import { getDbForTenant } from '@/lib/db/connection'
import { usuarioAtualIdDb } from '@/lib/auth/usuarioAtual'
import { LeadService } from '@/lib/services/crm/LeadService'
import { ok, created, badRequest, serverError } from '@/lib/api/responses'

type Params = { params: { tenant: string } }

const leadSchema = z.object({
  nomeEmpresa: z.string().min(2).max(200),
  contatoNome: z.string().max(100).optional(),
  telefone:    z.string().max(20).optional(),
  email:       z.string().max(150).optional(),
  valorEstimadoCentavos: z.number().int().min(0).optional(),
  responsavel: z.string().max(100).optional(),
  proximaAcaoData: z.string().optional().nullable(),
  observacao:  z.string().max(2000).optional(),
})

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    await exigirModulo(tenant.schemaName, 'crm')
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      return ok(await new LeadService(db).listar())
    } finally { release() }
  } catch (err) { return serverError(err) }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    await exigirModulo(tenant.schemaName, 'crm')
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const body    = leadSchema.parse(await req.json())
      const userId  = await usuarioAtualIdDb(db)
      return created(await new LeadService(db).criar(body, userId))
    } catch (err: any) {
      if (err?.name === 'ZodError') return badRequest('Dados inválidos.')
      throw err
    } finally { release() }
  } catch (err) { return serverError(err) }
}
