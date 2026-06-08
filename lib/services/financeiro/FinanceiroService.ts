import { and, eq, gte, lte, desc, count, sql, asc } from 'drizzle-orm'
import type { AppDB } from '@/lib/db/connection'
import { dbDespesa } from '@/lib/db/schemas/financeiro'
import { dbGastoFixoValor } from '@/lib/db/schemas/financeiro'
import { dbVenda } from '@/lib/db/schemas/vendas'

export class FinanceiroService {
  constructor(private db: AppDB) {}

  // ─── GERAÇÃO AUTOMÁTICA DE RECORRENTES ───────────────────────────────────
  async gerarRecorrentesDoMes(mes: number, ano: number, userId: number) {
    // Busca despesas recorrentes originais (não geradas automaticamente)
    const originais = await this.db.select().from(dbDespesa).where(
      and(
        eq(dbDespesa.activeFlag, true),
        eq(dbDespesa.recorrente, true),
        eq((dbDespesa as any).geradaAutomaticamente, false),
      )
    )

    let gerados = 0
    for (const origem of originais) {
      // Verifica se já existe cópia para este mês/ano
      const existentes = await this.db.execute(sql`
        SELECT COUNT(*) as total FROM t_despesa
        WHERE despesa_origem_id = ${origem.despesaId}
          AND mes_competencia = ${mes}
          AND ano_competencia = ${ano}
          AND active_flg = true
      `)
      const total = Number((existentes.rows[0] as any)?.total ?? 0)
      if (total > 0) continue

      // Gera a cópia para este mês
      const dataDespesa = new Date(ano, mes - 1, 1)
      const now = new Date()
      await this.db.execute(sql`
        INSERT INTO t_despesa (
          nome, categoria, valor, data_despesa, recorrente,
          periodo_recorrencia, observacao,
          mes_competencia, ano_competencia,
          despesa_origem_id, gerada_automaticamente,
          created_by, updated_by, created_dt, updated_dt, active_flg, modification_num
        ) VALUES (
          ${origem.nome}, ${origem.categoria}, ${origem.valor},
          ${dataDespesa.toISOString()}, true,
          ${origem.periodoRecorrencia ?? 'mensal'}, ${origem.observacao ?? null},
          ${mes}, ${ano},
          ${origem.despesaId}, true,
          ${userId}, ${userId}, ${now.toISOString()}, ${now.toISOString()}, true, 0
        )
      `)
      gerados++
    }
    return gerados
  }

  // ─── DESPESAS POR MÊS ────────────────────────────────────────────────────
  async listDespesasMes({ mes, ano, categoria, userId = 1 }: {
    mes: number; ano: number; categoria?: string; userId?: number
  }) {
    // Auto-gera recorrentes do mês antes de listar
    await this.gerarRecorrentesDoMes(mes, ano, userId)

    const conditions: any[] = [
      eq(dbDespesa.activeFlag, true),
      sql`mes_competencia = ${mes}`,
      sql`ano_competencia = ${ano}`,
    ]
    if (categoria) conditions.push(eq(dbDespesa.categoria, categoria))

    return this.db.select().from(dbDespesa)
      .where(and(...conditions))
      .orderBy(asc(dbDespesa.dataDespesa))
  }

  async criar(payload: {
    nome: string; categoria: string; valor: number
    dataDespesa: string; recorrente: boolean
    periodoRecorrencia?: string; observacao?: string; userId: number
    mes?: number; ano?: number
  }) {
    const now = new Date()
    const dt  = new Date(payload.dataDespesa)
    const mes = payload.mes ?? dt.getMonth() + 1
    const ano = payload.ano ?? dt.getFullYear()

    const [result] = await this.db.insert(dbDespesa).values({
      nome:               payload.nome,
      categoria:          payload.categoria,
      valor:              payload.valor,
      dataDespesa:        dt,
      recorrente:         payload.recorrente,
      periodoRecorrencia: payload.periodoRecorrencia ?? null,
      observacao:         payload.observacao ?? null,
      createdBy:          payload.userId,
      updatedBy:          payload.userId,
      createdDt:          now,
      updatedDt:          now,
    } as any).returning({ despesaId: dbDespesa.despesaId })

    // Atualiza competência
    await this.db.execute(sql`
      UPDATE t_despesa SET mes_competencia = ${mes}, ano_competencia = ${ano}
      WHERE despesa_id = ${result.despesaId}
    `)
    return result
  }

  async excluir(id: number, userId: number) {
    await this.db.update(dbDespesa).set({ activeFlag: false, updatedDt: new Date(), updatedBy: userId })
      .where(eq(dbDespesa.despesaId, id))
    return { ok: true }
  }

  // ─── KPIs DO MÊS ─────────────────────────────────────────────────────────
  async kpisMes(mes: number, ano: number) {
    const inicio = new Date(ano, mes - 1, 1)
    const fim    = new Date(ano, mes, 0, 23, 59, 59, 999)
    const hoje   = new Date()
    const inicioHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())

    const [receitaMes, despesasMes, receitaHoje] = await Promise.all([
      this.db.select({ total: sql<number>`COALESCE(SUM(total), 0)` }).from(dbVenda)
        .where(and(eq(dbVenda.activeFlag, true), gte(dbVenda.vendidaEm, inicio), lte(dbVenda.vendidaEm, fim))),
      this.db.execute(sql`
        SELECT COALESCE(SUM(valor), 0) as total FROM t_despesa
        WHERE active_flg = true AND mes_competencia = ${mes} AND ano_competencia = ${ano}
      `),
      this.db.select({ total: sql<number>`COALESCE(SUM(total), 0)` }).from(dbVenda)
        .where(and(eq(dbVenda.activeFlag, true), gte(dbVenda.vendidaEm, inicioHoje))),
    ])

    const receita  = Number(receitaMes[0]?.total ?? 0)
    const despesas = Number((despesasMes.rows[0] as any)?.total ?? 0)
    return {
      receitaMes:  receita,
      despesasMes: despesas,
      resultado:   receita - despesas,
      receitaHoje: Number(receitaHoje[0]?.total ?? 0),
      mes, ano,
    }
  }

  // ─── DRE DO MÊS ──────────────────────────────────────────────────────────
  async dreMes(mes: number, ano: number) {
    const inicio = new Date(ano, mes - 1, 1)
    const fim    = new Date(ano, mes, 0, 23, 59, 59, 999)

    const [receitaData, despesasData] = await Promise.all([
      this.db.select({ total: sql<number>`COALESCE(SUM(total), 0)`, qtd: count() }).from(dbVenda)
        .where(and(eq(dbVenda.activeFlag, true), gte(dbVenda.vendidaEm, inicio), lte(dbVenda.vendidaEm, fim))),
      this.db.execute(sql`
        SELECT categoria, COALESCE(SUM(valor), 0) as total
        FROM t_despesa
        WHERE active_flg = true AND mes_competencia = ${mes} AND ano_competencia = ${ano}
        GROUP BY categoria ORDER BY categoria
      `),
    ])

    const receita       = Number(receitaData[0]?.total ?? 0)
    const qtdVendas     = Number(receitaData[0]?.qtd ?? 0)
    const porCategoria: Record<string, number> = {}
    for (const row of despesasData.rows as any[]) {
      porCategoria[row.categoria] = Number(row.total)
    }
    const totalDespesas = Object.values(porCategoria).reduce((a, b) => a + b, 0)

    return { receita, qtdVendas, totalDespesas, resultado: receita - totalDespesas, porCategoria, mes, ano }
  }

  // ─── DEMONSTRATIVO ANUAL ──────────────────────────────────────────────────
  async demonstrativo(ano: number) {
    const [vendas, despesas, gastos] = await Promise.all([
      this.db.execute(sql`
        SELECT EXTRACT(MONTH FROM vendida_em)::int as mes,
               COALESCE(SUM(total), 0)::bigint as receita, COUNT(*)::int as qtd
        FROM t_venda
        WHERE active_flg = true AND EXTRACT(YEAR FROM vendida_em) = ${ano}
        GROUP BY mes ORDER BY mes
      `),
      this.db.execute(sql`
        SELECT mes_competencia as mes, COALESCE(SUM(valor), 0)::bigint as total_despesas
        FROM t_despesa
        WHERE active_flg = true AND ano_competencia = ${ano}
        GROUP BY mes ORDER BY mes
      `),
      this.db.select().from(dbGastoFixoValor)
        .where(and(eq(dbGastoFixoValor.ano, ano), eq(dbGastoFixoValor.activeFlag, true))),
    ])

    const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
    return meses.map((label, i) => {
      const mesNum = i + 1
      const v = (vendas.rows as any[]).find(r => Number(r.mes) === mesNum)
      const d = (despesas.rows as any[]).find(r => Number(r.mes) === mesNum)
      const fixos = gastos.filter(g => g.mes === mesNum).reduce((a, g) => a + g.valor, 0)
      const receita  = Number(v?.receita ?? 0)
      const desp     = Number(d?.total_despesas ?? 0)
      const resultado = receita - desp - fixos
      return {
        mes: label, mesNum, receita, despesas: desp, fixos, resultado,
        margem: receita > 0 ? ((resultado / receita) * 100).toFixed(1) : '0.0',
      }
    })
  }

  // ─── GASTOS FIXOS ────────────────────────────────────────────────────────
  async copiarGastosFixosMesAnterior(mes: number, ano: number) {
    const mesPrev = mes === 1 ? 12 : mes - 1
    const anoPrev = mes === 1 ? ano - 1 : ano

    const valoresPrev = await this.db.execute(sql`
      SELECT categoria_id, valor FROM t_gasto_fixo_valor
      WHERE ano = ${anoPrev} AND mes = ${mesPrev} AND active_flg = true AND valor > 0
    `)

    let copiados = 0
    for (const row of valoresPrev.rows as any[]) {
      // Só insere se não existe valor para este mês/ano/categoria
      await this.db.execute(sql`
        INSERT INTO t_gasto_fixo_valor (categoria_id, ano, mes, valor, created_dt, updated_dt, created_by, updated_by, active_flg, modification_num)
        SELECT ${row.categoria_id}, ${ano}, ${mes}, ${row.valor}, NOW(), NOW(), 1, 1, true, 0
        WHERE NOT EXISTS (
          SELECT 1 FROM t_gasto_fixo_valor
          WHERE categoria_id = ${row.categoria_id} AND ano = ${ano} AND mes = ${mes}
        )
        ON CONFLICT DO NOTHING
      `)
      copiados++
    }
    return copiados
  }
}