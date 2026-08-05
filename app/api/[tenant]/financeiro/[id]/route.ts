// @ts-nocheck
// ESTE ARQUIVO VAI EM: app/api/[tenant]/financeiro/[id]/route.ts
//
// Só existia DELETE aqui. Como a tela de Financeiro manda PUT para editar uma
// despesa, o Next respondia 405 com corpo VAZIO — e o `res.json()` do cliente
// estourava em "Unexpected end of JSON input", que não parece erro de rota.
// Daí a impressão de que a edição "não fazia nada".
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { usuarioAtualIdDb } from '@/lib/auth/usuarioAtual'
import { FinanceiroService } from '@/lib/services/financeiro/FinanceiroService'
import { ok, serverError } from '@/lib/api/responses'

type Params = { params: { tenant: string; id: string } }

// Tudo opcional: a edição altera o que a tela mandou e preserva o resto.
const despesaUpdateSchema = z.object({
  nome:               z.string().min(2).max(200).optional(),
  categoria:          z.string().max(100).optional(),
  valor:              z.number().int().min(1).optional(),
  dataDespesa:        z.string().optional(),
  recorrente:         z.boolean().optional(),
  periodoRecorrencia: z.string().nullable().optional(),
  observacao:         z.string().max(500).nullable().optional(),
  mes:                z.number().int().min(1).max(12).optional(),
  ano:                z.number().int().min(2020).optional(),
})

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const payload = despesaUpdateSchema.parse(await req.json())
      const userId  = await usuarioAtualIdDb(db)
      const service = new FinanceiroService(db, tenant.schemaName)
      return ok(await service.atualizar(Number(params.id), { ...payload, userId }))
    } finally {
      release()
    }
  } catch (err) {
    return serverError(err)
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      // Antes era o literal 1: o updated_by da exclusão apontava sempre para o
      // mesmo usuário, independente de quem apagou.
      const userId  = await usuarioAtualIdDb(db)
      const service = new FinanceiroService(db, tenant.schemaName)
      await service.excluir(Number(params.id), userId)
      return ok({ deleted: true })
    } finally {
      release()
    }
  } catch (err) {
    return serverError(err)
  }
}
