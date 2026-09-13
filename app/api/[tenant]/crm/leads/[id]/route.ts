// app/api/[tenant]/crm/leads/[id]/route.ts
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { resolveTenant } from '@/lib/auth/tenant'
import { exigirModulo } from '@/lib/auth/permissoes'
import { getDbForTenant } from '@/lib/db/connection'
import { usuarioAtualIdDb } from '@/lib/auth/usuarioAtual'
import { LeadService } from '@/lib/services/crm/LeadService'
import { ok, badRequest, serverError } from '@/lib/api/responses'

type Params = { params: { tenant: string; id: string } }

const updateSchema = z.object({
  nomeEmpresa: z.string().min(2).max(200).optional(),
  contatoNome: z.string().max(100).optional().nullable(),
  telefone:    z.string().max(20).optional().nullable(),
  email:       z.string().max(150).optional().nullable(),
  valorEstimadoCentavos: z.number().int().min(0).optional(),
  responsavel: z.string().max(100).optional().nullable(),
  proximaAcaoData: z.string().optional().nullable(),
  observacao:  z.string().max(2000).optional().nullable(),
  estagio:     z.enum(['novo', 'contatado', 'negociando', 'proposta', 'ganho', 'perdido']).optional(),
  motivoPerda: z.string().max(200).optional().nullable(),
})

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    await exigirModulo(tenant.schemaName, 'crm')
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const body   = updateSchema.parse(await req.json())
      const userId = await usuarioAtualIdDb(db)
      const result = await new LeadService(db).atualizar(Number(params.id), body as any, userId)
      if (!result) return badRequest('Lead não encontrado.')
      return ok(result)
    } catch (err: any) {
      if (err?.name === 'ZodError') return badRequest('Dados inválidos.')
      throw err
    } finally { release() }
  } catch (err) { return serverError(err) }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    await exigirModulo(tenant.schemaName, 'crm')
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const userId = await usuarioAtualIdDb(db)
      const ok_ = await new LeadService(db).excluir(Number(params.id), userId)
      if (!ok_) return badRequest('Lead não encontrado.')
      return ok({ excluido: true })
    } finally { release() }
  } catch (err) { return serverError(err) }
}
