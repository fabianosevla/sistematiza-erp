// @ts-nocheck
import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { ok, serverError } from '@/lib/api/responses'
import { dbVenda, dbVendaItem, dbVendaPagamento } from '@/lib/db/schemas/vendas'
import { dbDespesa } from '@/lib/db/schemas/financeiro'
import { dbProduto } from '@/lib/db/schemas/cadastros'
import { and, eq, gte, lte, desc, sql, count } from 'drizzle-orm'

type Params = { params: { tenant: string } }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const now  = new Date()
      const base = eq(dbVenda.activeFlag, true)

      // Últimos 6 meses
      const faturamento6m = []
      for (let i = 5; i >= 0; i--) {
        const inicio = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const fim    = new Date(now.getFullYear(), now.getMonth() - i + 1, 0)
        fim.setHours(23, 59, 59, 999)
        const [res] = await db.select({ total: sql<number>`COALESCE(SUM(total), 0)`, qtd: count() })
          .from(dbVenda).where(and(base, gte(dbVenda.vendidaEm, inicio), lte(dbVenda.vendidaEm, fim)))
        faturamento6m.push({
          mes:   inicio.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
          valor: Number(res?.total ?? 0) / 100,
          qtd:   Number(res?.qtd ?? 0),
        })
      }

      // Vendas por dia do mês atual
      const inicioMes = new Date(now.getFullYear(), now.getMonth(), 1)
      const vendasDia = []
      for (let d = 1; d <= now.getDate(); d++) {
        const dInicio = new Date(now.getFullYear(), now.getMonth(), d)
        const dFim    = new Date(now.getFullYear(), now.getMonth(), d, 23, 59, 59, 999)
        const [res]   = await db.select({ total: sql<number>`COALESCE(SUM(total), 0)` })
          .from(dbVenda).where(and(base, gte(dbVenda.vendidaEm, dInicio), lte(dbVenda.vendidaEm, dFim)))
        vendasDia.push({ dia: String(d), valor: Number(res?.total ?? 0) / 100 })
      }

      // Top 5 produtos mais vendidos (último mês)
      const topProdutos = await db.select({
        nome:  dbVendaItem.nomeProduto,
        total: sql<number>`SUM(${dbVendaItem.quantidade})`,
        valor: sql<number>`SUM(${dbVendaItem.subtotal})`,
      }).from(dbVendaItem)
        .leftJoin(dbVenda, eq(dbVendaItem.vendaId, dbVenda.vendaId))
        .where(and(eq(dbVenda.activeFlag, true), gte(dbVenda.vendidaEm, inicioMes)))
        .groupBy(dbVendaItem.nomeProduto)
        .orderBy(desc(sql`SUM(${dbVendaItem.quantidade})`))
        .limit(5)

      // Receita vs Despesas (últimos 6 meses)
      const receitaVsDespesas = []
      for (let i = 5; i >= 0; i--) {
        const inicio = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const fim    = new Date(now.getFullYear(), now.getMonth() - i + 1, 0)
        fim.setHours(23, 59, 59, 999)
        const [rec] = await db.select({ total: sql<number>`COALESCE(SUM(total), 0)` })
          .from(dbVenda).where(and(base, gte(dbVenda.vendidaEm, inicio), lte(dbVenda.vendidaEm, fim)))
        const [des] = await db.select({ total: sql<number>`COALESCE(SUM(valor), 0)` })
          .from(dbDespesa).where(and(eq(dbDespesa.activeFlag, true), gte(dbDespesa.dataDespesa, inicio), lte(dbDespesa.dataDespesa, fim)))
        receitaVsDespesas.push({
          mes:      inicio.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
          receita:  Number(rec?.total ?? 0) / 100,
          despesas: Number(des?.total ?? 0) / 100,
        })
      }

      // Estoque crítico
      const estoqueCritico = await db.select({
        nome:          dbProduto.nome,
        estoqueAtual:  dbProduto.estoqueAtual,
        estoqueMinimo: dbProduto.estoqueMinimo,
      }).from(dbProduto)
        .where(and(eq(dbProduto.activeFlag, true), sql`${dbProduto.estoqueAtual} <= ${dbProduto.estoqueMinimo}`))
        .orderBy(dbProduto.estoqueAtual)
        .limit(8)

      // Vendas por forma de pagamento (mês atual)
      const porForma = await db.select({
        forma: dbVendaPagamento.forma,
        total: sql<number>`SUM(${dbVendaPagamento.valor})`,
      }).from(dbVendaPagamento)
        .leftJoin(dbVenda, eq(dbVendaPagamento.vendaId, dbVenda.vendaId))
        .where(and(eq(dbVenda.activeFlag, true), gte(dbVenda.vendidaEm, inicioMes)))
        .groupBy(dbVendaPagamento.forma)
        .orderBy(desc(sql`SUM(${dbVendaPagamento.valor})`))

      return ok({
        faturamento6m,
        vendasDia,
        topProdutos: topProdutos.map(p => ({ nome: p.nome, qtd: Number(p.total), valor: Number(p.valor) / 100 })),
        receitaVsDespesas,
        estoqueCritico,
        porForma: porForma.map(p => ({ forma: p.forma, valor: Number(p.total) / 100 })),
      })
    } finally { release() }
  } catch (err) { return serverError(err) }
}