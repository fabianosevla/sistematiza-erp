import { and, eq, gte, lte, desc, count, sql, asc } from 'drizzle-orm'
import type { AppDB } from '@/lib/db/connection'
import { dbDespesa } from '@/lib/db/schemas/financeiro'
import { dbGastoFixoValor } from '@/lib/db/schemas/financeiro'
import { dbVenda } from '@/lib/db/schemas/vendas'

export class FinanceiroService {
  constructor(private db: AppDB) {}

  async listDespesas({ page, limit, dataInicio, dataFim, categoria }: {
    page: number; limit: number; dataInicio?: string; dataFim?: string; categoria?: string
  }) {
    const offset = (page - 1) * limit
    const conditions = [eq(dbDespesa.activeFlag, true)]
    if (dataInicio) conditions.push(gte(dbDespesa.dataDespesa, new Date(dataInicio)))
    if (dataFim) { const fim = new Date(dataFim); fim.setHours(23,59,59,999); conditions.push(lte(dbDespesa.dataDespesa, fim)) }
    if (categoria) conditions.push(eq(dbDespesa.categoria, categoria))
    const where = and(...conditions)

    const [despesas, totals] = await Promise.all([
      this.db.select().from(dbDespesa).where(where).orderBy(desc(dbDespesa.dataDespesa)).limit(limit).offset(offset),
      this.db.select({ total: count() }).from(dbDespesa).where(where),
    ])
    const total = Number(totals[0]?.total ?? 0)
    return { data: despesas, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } }
  }

  async criar(payload: { nome: string; categoria: string; valor: number; dataDespesa: string; recorrente: boolean; periodoRecorrencia?: string; observacao?: string; userId: number }) {
    const now = new Date()
    const [result] = await this.db.insert(dbDespesa).values({
      nome: payload.nome, categoria: payload.categoria, valor: payload.valor,
      dataDespesa: new Date(payload.dataDespesa), recorrente: payload.recorrente,
      periodoRecorrencia: payload.periodoRecorrencia ?? null,
      observacao: payload.observacao ?? null,
      createdBy: payload.userId, updatedBy: payload.userId, createdDt: now, updatedDt: now,
    }).returning({ despesaId: dbDespesa.despesaId })
    return result
  }

  async excluir(id: number, userId: number) {
    await this.db.update(dbDespesa).set({ activeFlag: false, updatedDt: new Date(), updatedBy: userId })
      .where(eq(dbDespesa.despesaId, id))
    return { ok: true }
  }

  async dre(dataInicio: string, dataFim: string) {
    const inicio = new Date(dataInicio)
    const fim    = new Date(dataFim); fim.setHours(23,59,59,999)
    const [receitaData, despesasData] = await Promise.all([
      this.db.select({ total: sql<number>`COALESCE(SUM(total), 0)`, qtd: count() }).from(dbVenda)
        .where(and(eq(dbVenda.activeFlag, true), gte(dbVenda.vendidaEm, inicio), lte(dbVenda.vendidaEm, fim))),
      this.db.select().from(dbDespesa)
        .where(and(eq(dbDespesa.activeFlag, true), gte(dbDespesa.dataDespesa, inicio), lte(dbDespesa.dataDespesa, fim)))
        .orderBy(asc(dbDespesa.categoria)),
    ])
    const receita       = Number(receitaData[0]?.total ?? 0)
    const qtdVendas     = Number(receitaData[0]?.qtd ?? 0)
    const totalDespesas = despesasData.reduce((a, d) => a + d.valor, 0)
    const porCategoria: Record<string, number> = {}
    for (const d of despesasData) porCategoria[d.categoria] = (porCategoria[d.categoria] ?? 0) + d.valor
    return { receita, qtdVendas, totalDespesas, resultado: receita - totalDespesas, porCategoria }
  }

  async kpis() {
    const now  = new Date()
    const mes  = new Date(now.getFullYear(), now.getMonth(), 1)
    const hoje = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const [receitaMes, despesasMes, receitaHoje] = await Promise.all([
      this.db.select({ total: sql<number>`COALESCE(SUM(total), 0)` }).from(dbVenda)
        .where(and(eq(dbVenda.activeFlag, true), gte(dbVenda.vendidaEm, mes))),
      this.db.select({ total: sql<number>`COALESCE(SUM(valor), 0)` }).from(dbDespesa)
        .where(and(eq(dbDespesa.activeFlag, true), gte(dbDespesa.dataDespesa, mes))),
      this.db.select({ total: sql<number>`COALESCE(SUM(total), 0)` }).from(dbVenda)
        .where(and(eq(dbVenda.activeFlag, true), gte(dbVenda.vendidaEm, hoje))),
    ])
    const receita  = Number(receitaMes[0]?.total ?? 0)
    const despesas = Number(despesasMes[0]?.total ?? 0)
    return { receitaMes: receita, despesasMes: despesas, resultado: receita - despesas, receitaHoje: Number(receitaHoje[0]?.total ?? 0) }
  }

  async demonstrativo(ano: number) {
    const [vendas, despesas, gastos] = await Promise.all([
      this.db.execute(sql`
        SELECT EXTRACT(MONTH FROM vendida_em)::int as mes,
               COALESCE(SUM(total), 0)::bigint as receita,
               COUNT(*)::int as qtd
        FROM t_venda
        WHERE active_flg = true AND EXTRACT(YEAR FROM vendida_em) = ${ano}
        GROUP BY mes ORDER BY mes
      `),
      this.db.execute(sql`
        SELECT EXTRACT(MONTH FROM data_despesa)::int as mes,
               COALESCE(SUM(valor), 0)::bigint as total_despesas
        FROM t_despesa
        WHERE active_flg = true AND EXTRACT(YEAR FROM data_despesa) = ${ano}
        GROUP BY mes ORDER BY mes
      `),
      this.db.select().from(dbGastoFixoValor).where(and(eq(dbGastoFixoValor.ano, ano), eq(dbGastoFixoValor.activeFlag, true))),
    ])

    const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
    return meses.map((label, i) => {
      const mesNum = i + 1
      const v = (vendas.rows as any[]).find(r => Number(r.mes) === mesNum)
      const d = (despesas.rows as any[]).find(r => Number(r.mes) === mesNum)
      const fixos = gastos.filter(g => g.mes === mesNum).reduce((a, g) => a + g.valor, 0)
      const receita = Number(v?.receita ?? 0)
      const desp    = Number(d?.total_despesas ?? 0)
      const resultado = receita - desp - fixos
      return {
        mes: label, mesNum,
        receita, despesas: desp, fixos, resultado,
        margem: receita > 0 ? ((resultado / receita) * 100).toFixed(1) : '0.0',
      }
    })
  }
}