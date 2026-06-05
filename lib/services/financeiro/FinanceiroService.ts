import { and, eq, gte, lte, desc, count, sql, asc } from 'drizzle-orm'
import type { AppDB } from '@/lib/db/connection'
import { dbDespesa } from '@/lib/db/schemas/financeiro'
import { dbVenda } from '@/lib/db/schemas/vendas'

export const CATEGORIAS_DESPESA = [
  'Matéria Prima',
  'Embalagem',
  'Entrega / Frete',
  'Funcionários',
  'Aluguel',
  'Energia / Água',
  'Marketing',
  'Impostos',
  'Outros',
]

export class FinanceiroService {
  constructor(private db: AppDB) {}

  async listDespesas({ page, limit, dataInicio, dataFim, categoria }: {
    page: number
    limit: number
    dataInicio?: string
    dataFim?: string
    categoria?: string
  }) {
    const offset = (page - 1) * limit
    const conditions = [eq(dbDespesa.activeFlag, true)]
    if (dataInicio) conditions.push(gte(dbDespesa.dataDespesa, new Date(dataInicio)))
    if (dataFim) {
      const fim = new Date(dataFim)
      fim.setHours(23, 59, 59, 999)
      conditions.push(lte(dbDespesa.dataDespesa, fim))
    }
    if (categoria) conditions.push(eq(dbDespesa.categoria, categoria))
    const whereClause = and(...conditions)

    const [despesas, totals] = await Promise.all([
      this.db.select().from(dbDespesa).where(whereClause)
        .orderBy(desc(dbDespesa.dataDespesa)).limit(limit).offset(offset),
      this.db.select({ total: count() }).from(dbDespesa).where(whereClause),
    ])

    const total = Number(totals[0]?.total ?? 0)
    return { data: despesas, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } }
  }

  async criar(payload: {
    nome:               string
    categoria:          string
    valor:              number
    dataDespesa:        string
    recorrente:         boolean
    periodoRecorrencia?: string
    observacao?:        string
    userId:             number
  }) {
    const now = new Date()
    const [result] = await this.db.insert(dbDespesa).values({
      nome:               payload.nome,
      categoria:          payload.categoria,
      valor:              payload.valor,
      dataDespesa:        new Date(payload.dataDespesa),
      recorrente:         payload.recorrente,
      periodoRecorrencia: payload.periodoRecorrencia ?? null,
      observacao:         payload.observacao ?? null,
      createdBy:          payload.userId,
      updatedBy:          payload.userId,
      createdDt:          now,
      updatedDt:          now,
    }).returning({ despesaId: dbDespesa.despesaId })
    return result
  }

  async atualizar(id: number, payload: {
    nome?:               string
    categoria?:          string
    valor?:              number
    dataDespesa?:        string
    recorrente?:         boolean
    periodoRecorrencia?: string
    observacao?:         string
    userId:              number
  }) {
    const now = new Date()
    const [result] = await this.db.update(dbDespesa).set({
      ...payload,
      dataDespesa: payload.dataDespesa ? new Date(payload.dataDespesa) : undefined,
      updatedDt:   now,
      updatedBy:   payload.userId,
    }).where(eq(dbDespesa.despesaId, id))
    .returning({ despesaId: dbDespesa.despesaId })
    return result
  }

  async excluir(id: number, userId: number) {
    const now = new Date()
    await this.db.update(dbDespesa).set({
      activeFlag: false, updatedDt: now, updatedBy: userId,
    }).where(eq(dbDespesa.despesaId, id))
    return { ok: true }
  }

  async dre(dataInicio: string, dataFim: string) {
    const inicio = new Date(dataInicio)
    const fim    = new Date(dataFim)
    fim.setHours(23, 59, 59, 999)

    const base = eq(dbVenda.activeFlag, true)

    const [receitaData, despesasData] = await Promise.all([
      this.db.select({
        total: sql<number>`COALESCE(SUM(total), 0)`,
        qtd:   count(),
      }).from(dbVenda).where(and(
        base,
        gte(dbVenda.vendidaEm, inicio),
        lte(dbVenda.vendidaEm, fim),
      )),

      this.db.select().from(dbDespesa).where(and(
        eq(dbDespesa.activeFlag, true),
        gte(dbDespesa.dataDespesa, inicio),
        lte(dbDespesa.dataDespesa, fim),
      )).orderBy(asc(dbDespesa.categoria)),
    ])

    const receita       = Number(receitaData[0]?.total ?? 0)
    const qtdVendas     = Number(receitaData[0]?.qtd ?? 0)
    const totalDespesas = despesasData.reduce((a, d) => a + d.valor, 0)
    const resultado     = receita - totalDespesas

    // Agrupar despesas por categoria
    const porCategoria: Record<string, number> = {}
    for (const d of despesasData) {
      porCategoria[d.categoria] = (porCategoria[d.categoria] ?? 0) + d.valor
    }

    return {
      receita,
      qtdVendas,
      totalDespesas,
      resultado,
      porCategoria,
      despesas: despesasData,
    }
  }

  async kpis() {
    const now  = new Date()
    const mes  = new Date(now.getFullYear(), now.getMonth(), 1)
    const hoje = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    const [receitaMes, despesasMes, receitaHoje] = await Promise.all([
      this.db.select({
        total: sql<number>`COALESCE(SUM(total), 0)`,
      }).from(dbVenda).where(and(
        eq(dbVenda.activeFlag, true),
        gte(dbVenda.vendidaEm, mes),
      )),

      this.db.select({
        total: sql<number>`COALESCE(SUM(valor), 0)`,
      }).from(dbDespesa).where(and(
        eq(dbDespesa.activeFlag, true),
        gte(dbDespesa.dataDespesa, mes),
      )),

      this.db.select({
        total: sql<number>`COALESCE(SUM(total), 0)`,
      }).from(dbVenda).where(and(
        eq(dbVenda.activeFlag, true),
        gte(dbVenda.vendidaEm, hoje),
      )),
    ])

    const receita   = Number(receitaMes[0]?.total ?? 0)
    const despesas  = Number(despesasMes[0]?.total ?? 0)
    const resultado = receita - despesas

    return {
      receitaMes:  receita,
      despesasMes: despesas,
      resultado,
      receitaHoje: Number(receitaHoje[0]?.total ?? 0),
    }
  }
}