import { and, eq, ilike, count, asc, desc, sql } from 'drizzle-orm'
import type { AppDB } from '@/lib/db/connection'
import { dbProduto } from '@/lib/db/schemas/cadastros'
import { dbInsumo } from '@/lib/db/schemas/cadastros'
import { dbMovimentacaoEstoque } from '@/lib/db/schemas/estoque'
import { DebitoInsumoService } from './DebitoInsumoService'

export type StatusEstoque = 'normal' | 'atencao' | 'critico' | 'zerado'

function getStatus(atual: number, minimo: number): StatusEstoque {
  if (atual <= 0) return 'zerado'
  if (atual <= minimo) return 'critico'
  if (atual <= minimo * 1.5) return 'atencao'
  return 'normal'
}

export class EstoqueService {
  // schemaName é repassado ao DebitoInsumoService, que usa pool direto e
  // precisa do SET search_path. Quem instancia sem ele perde o débito de
  // insumo em silêncio — por isso o aviso no console abaixo.
  constructor(private db: AppDB, private schemaName: string = '') {}

  async listProdutos({ page, limit, search, status }: {
    page: number; limit: number; search?: string; status?: string
  }) {
    const offset = (page - 1) * limit
    const conditions = [eq(dbProduto.activeFlag, true)]
    if (search) conditions.push(ilike(dbProduto.nome, `%${search}%`))
    const whereClause = and(...conditions)
    const [data, totals] = await Promise.all([
      this.db.select().from(dbProduto).where(whereClause).orderBy(asc(dbProduto.nome)).limit(limit).offset(offset),
      this.db.select({ total: count() }).from(dbProduto).where(whereClause),
    ])
    const enriched = data.map(p => ({ ...p, status: getStatus(p.estoqueAtual, p.estoqueMinimo) }))
    const filtered = status ? enriched.filter(p => p.status === status) : enriched
    const total = Number(totals[0]?.total ?? 0)
    const kpis = {
      total,
      normal:  enriched.filter(p => p.status === 'normal').length,
      atencao: enriched.filter(p => p.status === 'atencao').length,
      critico: enriched.filter(p => p.status === 'critico').length,
      zerado:  enriched.filter(p => p.status === 'zerado').length,
    }
    return { data: filtered, meta: { total: filtered.length, page, limit, totalPages: Math.ceil(filtered.length / limit) }, kpis }
  }

  async listInsumos({ page, limit, search, status }: {
    page: number; limit: number; search?: string; status?: string
  }) {
    const offset = (page - 1) * limit
    const conditions = [eq(dbInsumo.activeFlag, true)]
    if (search) conditions.push(ilike(dbInsumo.nome, `%${search}%`))
    const whereClause = and(...conditions)
    const [data, totals] = await Promise.all([
      this.db.select().from(dbInsumo).where(whereClause).orderBy(asc(dbInsumo.nome)).limit(limit).offset(offset),
      this.db.select({ total: count() }).from(dbInsumo).where(whereClause),
    ])
    const enriched = data.map(i => ({ ...i, status: getStatus(i.estoqueAtual, i.estoqueMinimo) }))
    const filtered = status ? enriched.filter(i => i.status === status) : enriched
    const total = Number(totals[0]?.total ?? 0)
    const kpis = {
      total,
      normal:  enriched.filter(i => i.status === 'normal').length,
      atencao: enriched.filter(i => i.status === 'atencao').length,
      critico: enriched.filter(i => i.status === 'critico').length,
      zerado:  enriched.filter(i => i.status === 'zerado').length,
    }
    return { data: filtered, meta: { total: filtered.length, page, limit, totalPages: Math.ceil(filtered.length / limit) }, kpis }
  }

  async movimentar({
    entidade, entidadeId, tipo, quantidade, precoCusto, observacao, userId,
  }: {
    entidade: 'produto' | 'insumo'
    entidadeId: number
    tipo: 'entrada' | 'saida' | 'ajuste'
    quantidade: number
    precoCusto?: number
    observacao?: string
    userId: number
  }) {
    const now = new Date()

    // t_movimentacao_estoque.quantidade é NUMERIC(12,3) — o Drizzle espera
    // string em coluna numeric. Antes era INTEGER e a rota arredondava, o que
    // fazia 0,5 kg de insumo virar 1 no histórico.
    const qtdMovimento = tipo === 'saida' ? -Math.abs(quantidade) : Math.abs(quantidade)

    await this.db.insert(dbMovimentacaoEstoque).values({
      tipo,
      entidade,
      entidadeId,
      quantidade:       String(qtdMovimento),
      precoCusto:       precoCusto ?? 0,
      observacao,
      dataMovimentacao: now,
      createdBy:        userId,
      updatedBy:        userId,
      createdDt:        now,
      updatedDt:        now,
    })

    let debitoInsumos: Awaited<ReturnType<DebitoInsumoService['debitar']>> | null = null

    if (entidade === 'produto') {
      if (tipo === 'ajuste') {
        await this.db.update(dbProduto).set({
          estoqueAtual: quantidade, updatedDt: now, updatedBy: userId,
        }).where(eq(dbProduto.produtoId, entidadeId))
      } else {
        const delta = tipo === 'saida' ? -Math.abs(quantidade) : Math.abs(quantidade)
        await this.db.update(dbProduto).set({
          estoqueAtual: sql`${dbProduto.estoqueAtual} + ${delta}`,
          updatedDt: now, updatedBy: userId,
        }).where(eq(dbProduto.produtoId, entidadeId))

        // Débito automático de insumos via ficha técnica — só na ENTRADA.
        // Produzir consome; ajuste é correção de inventário e não consome.
        if (tipo === 'entrada' && quantidade > 0) {
          if (!this.schemaName) {
            // Falha barulhenta: sem schemaName o DebitoInsumoService iria
            // para o schema errado e o insumo não baixaria, sem erro nenhum.
            console.error(
              '[EstoqueService] entrada de produto sem schemaName — ' +
              'o débito de insumo foi PULADO. Instancie com new EstoqueService(db, tenant.schemaName).'
            )
          } else {
            debitoInsumos = await new DebitoInsumoService(this.db, this.schemaName)
              .debitar(entidadeId, Math.abs(quantidade), userId)
          }
        }
      }
    } else {
      if (tipo === 'ajuste') {
        await this.db.update(dbInsumo).set({
          estoqueAtual: quantidade, updatedDt: now, updatedBy: userId,
        }).where(eq(dbInsumo.insumoId, entidadeId))
      } else {
        const delta = tipo === 'saida' ? -Math.abs(quantidade) : Math.abs(quantidade)
        await this.db.update(dbInsumo).set({
          estoqueAtual: sql`${dbInsumo.estoqueAtual} + ${delta}`,
          updatedDt: now, updatedBy: userId,
        }).where(eq(dbInsumo.insumoId, entidadeId))
      }
    }

    return { ok: true, debitoInsumos }
  }

  async historico({ entidade, entidadeId, limit }: {
    entidade: 'produto' | 'insumo'
    entidadeId: number
    limit?: number
  }) {
    const result = await this.db
      .select()
      .from(dbMovimentacaoEstoque)
      .where(and(
        eq(dbMovimentacaoEstoque.entidade, entidade),
        eq(dbMovimentacaoEstoque.entidadeId, entidadeId),
      ))
      .orderBy(desc(dbMovimentacaoEstoque.dataMovimentacao))
      .limit(limit ?? 20)
    return result
  }
}