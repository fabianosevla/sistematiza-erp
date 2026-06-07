// @ts-nocheck
import type { NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { dbProduto } from '@/lib/db/schemas/cadastros'
import { ok, serverError } from '@/lib/api/responses'

type Params = { params: { tenant: string } }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const produtos = await db.select({
        produtoId:     dbProduto.produtoId,
        nome:          dbProduto.nome,
        estoqueAtual:  dbProduto.estoqueAtual,
        estoqueMinimo: dbProduto.estoqueMinimo,
        unidade:       dbProduto.unidade,
      }).from(dbProduto).where(eq(dbProduto.activeFlag, true)).orderBy(dbProduto.nome)
      return ok(produtos)
    } finally { release() }
  } catch (err) { return serverError(err) }
}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const { produtoId, novoEstoque } = await req.json()
      await db.update(dbProduto).set({ estoqueAtual: Number(novoEstoque), updatedDt: new Date(), updatedBy: 1 })
        .where(eq(dbProduto.produtoId, Number(produtoId)))
      return ok({ ok: true })
    } finally { release() }
  } catch (err) { return serverError(err) }
}