// @ts-nocheck
// ESTE ARQUIVO VAI EM: app/api/[tenant]/compras/route.ts
//
//   GET  ?tipo=sugestoes                              → o que precisa comprar
//   GET  ?dataInicio=...&dataFim=...                  → historico de compras
//   POST                                              → registra a compra
//
// As sub-rotas antigas (cotacoes, listas, mrp, pedidos, requisicoes,
// conferencias) foram removidas junto com as abas que as usavam.
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { resolveTenant } from '@/lib/auth/tenant'
import { exigirModulo } from '@/lib/auth/permissoes'
import { getDbForTenant } from '@/lib/db/connection'
import { usuarioAtualIdDb } from '@/lib/auth/usuarioAtual'
import { ComprasService } from '@/lib/services/compras/ComprasService'
import { ok, created, serverError } from '@/lib/api/responses'

type Params = { params: { tenant: string } }

const itemSchema = z.object({
  insumoId:      z.number().int().nullable().optional(),
  nomeInsumo:    z.string().min(1).max(200),
  unidade:       z.string().max(20).optional(),
  quantidade:    z.number().positive(),
  valorUnitario: z.number().int().min(0),
})

const compraSchema = z.object({
  fornecedorId:   z.number().int().nullable().optional(),
  nomeFornecedor: z.string().max(200).optional(),
  dataCompra:     z.string(),
  documento:      z.string().max(60).optional(),
  condicao:       z.enum(['a_vista', 'a_prazo']),
  formaPagamento: z.string().max(60).optional(),
  dataVencimento: z.string().nullable().optional(),
  observacao:     z.string().max(500).optional(),
  itens:          z.array(itemSchema).min(1),
})

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    await exigirModulo(tenant.schemaName, 'compras')
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const { searchParams } = new URL(req.url)
      const service = new ComprasService(db)

      if (searchParams.get('tipo') === 'sugestoes') {
        const dias = Number(searchParams.get('dias') ?? 30)
        return ok(await service.sugestoes({ diasProjecao: dias }))
      }

      return ok(await service.list({
        dataInicio: searchParams.get('dataInicio') ?? undefined,
        dataFim:    searchParams.get('dataFim')    ?? undefined,
      }))
    } finally { release() }
  } catch (err) { return serverError(err) }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    await exigirModulo(tenant.schemaName, 'compras')
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const payload = compraSchema.parse(await req.json())
      const userId  = await usuarioAtualIdDb(db)
      return created(await new ComprasService(db).criar({ ...payload, userId }))
    } finally { release() }
  } catch (err) { return serverError(err) }
}
