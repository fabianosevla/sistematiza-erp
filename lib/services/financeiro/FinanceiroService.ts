import { and, eq, gte, lte, desc, count, sql, asc } from 'drizzle-orm'
import type { AppDB } from '@/lib/db/connection'
import { pool } from '@/lib/db/connection'
import { dbDespesa } from '@/lib/db/schemas/financeiro'
import { dbGastoFixoValor } from '@/lib/db/schemas/financeiro'
import { dbVenda } from '@/lib/db/schemas/vendas'

export class FinanceiroService {
  constructor(private db: AppDB, private schemaName: string = '') {}

  private async withSchema<T>(fn: (client: any) => Promise<T>): Promise<T> {
    const client = await pool.connect()
    try {
      if (this.schemaName) {
        await client.query(`SET search_path TO "${this.schemaName}", public`)
      }
      return await fn(client)
    } finally {
      client.release()
    }
  }

  /**
   * TAXAS DE MEIO DE PAGAMENTO — dedução de receita.
   *
   * A taxa fica em t_forma_pagamento.taxa (percentual, ex.: 1.99 para débito).
   * O pagamento da venda guarda a forma como TEXTO em t_venda_pagamento.forma,
   * então o vínculo é feito pelo nome, ignorando maiúsculas e espaços.
   *
   * Consequência conhecida: se alguém renomear "Débito" para "Cartão de Débito"
   * no cadastro, as vendas antigas param de casar e a taxa delas some do
   * histórico. A correção definitiva é congelar a taxa aplicada dentro de
   * t_venda_pagamento no momento da venda — fica como próximo passo.
   *
   * Cashback não é meio de pagamento com taxa; ele entra como 'Cashback
   * (fidelidade)' e simplesmente não casa com nenhuma forma cadastrada,
   * resultando em taxa zero. Correto.
   */
  private async taxasDoPeriodo(inicio: Date, fim: Date) {
    return this.withSchema(async client => {
      try {
        const r = await client.query(`
          SELECT COALESCE(vp.forma, 'Não informado')                       AS forma,
                 COALESCE(fp.taxa, 0)                                      AS taxa_pct,
                 COALESCE(SUM(vp.valor), 0)::bigint                        AS valor_pago,
                 COALESCE(SUM(ROUND(vp.valor * COALESCE(fp.taxa, 0) / 100.0)), 0)::bigint AS valor_taxa
          FROM t_venda_pagamento vp
          JOIN t_venda v ON v.venda_id = vp.venda_id AND v.active_flg = true
          LEFT JOIN t_forma_pagamento fp
                 ON LOWER(TRIM(fp.nome)) = LOWER(TRIM(vp.forma))
                AND fp.active_flg = true
          WHERE v.vendida_em >= $1 AND v.vendida_em <= $2
          GROUP BY vp.forma, fp.taxa
          HAVING COALESCE(SUM(vp.valor), 0) > 0
          ORDER BY 4 DESC
        `, [inicio.toISOString(), fim.toISOString()])

        const porForma = r.rows.map((row: any) => ({
          forma:      row.forma,
          taxaPct:    Number(row.taxa_pct),
          valorPago:  Number(row.valor_pago),
          valorTaxa:  Number(row.valor_taxa),
        }))
        return {
          total: porForma.reduce((a: number, f: any) => a + f.valorTaxa, 0),
          porForma,
        }
      } catch {
        // Tenant sem t_venda_pagamento ou sem t_forma_pagamento — sem taxa.
        return { total: 0, porForma: [] as any[] }
      }
    })
  }

  /** Taxas por mês do ano, para o demonstrativo. */
  private async taxasPorMes(ano: number): Promise<Record<number, number>> {
    return this.withSchema(async client => {
      try {
        const r = await client.query(`
          SELECT EXTRACT(MONTH FROM v.vendida_em)::int AS mes,
                 COALESCE(SUM(ROUND(vp.valor * COALESCE(fp.taxa, 0) / 100.0)), 0)::bigint AS total
          FROM t_venda_pagamento vp
          JOIN t_venda v ON v.venda_id = vp.venda_id AND v.active_flg = true
          LEFT JOIN t_forma_pagamento fp
                 ON LOWER(TRIM(fp.nome)) = LOWER(TRIM(vp.forma))
                AND fp.active_flg = true
          WHERE EXTRACT(YEAR FROM v.vendida_em) = $1
          GROUP BY mes ORDER BY mes
        `, [ano])
        const mapa: Record<number, number> = {}
        for (const row of r.rows) mapa[Number(row.mes)] = Number(row.total)
        return mapa
      } catch {
        return {}
      }
    })
  }

  async gerarRecorrentesDoMes(mes: number, ano: number, userId: number) {
    return this.withSchema(async client => {
      const originais = await client.query(`
        SELECT * FROM t_despesa
        WHERE active_flg = true AND recorrente = true AND gerada_automaticamente = false
      `).catch(() => ({ rows: [] }))

      let gerados = 0
      for (const origem of originais.rows) {
        const existentes = await client.query(`
          SELECT COUNT(*) as total FROM t_despesa
          WHERE despesa_origem_id = $1 AND mes_competencia = $2 AND ano_competencia = $3 AND active_flg = true
        `, [origem.despesa_id, mes, ano])
        if (Number(existentes.rows[0]?.total ?? 0) > 0) continue

        const dataDespesa = new Date(ano, mes - 1, 1)
        const now = new Date()
        await client.query(`
          INSERT INTO t_despesa (
            nome, categoria, valor, data_despesa, recorrente,
            periodo_recorrencia, observacao, mes_competencia, ano_competencia,
            despesa_origem_id, gerada_automaticamente,
            created_by, updated_by, created_dt, updated_dt, active_flg, modification_num
          ) VALUES ($1,$2,$3,$4,true,$5,$6,$7,$8,$9,true,$10,$10,$11,$11,true,0)
        `, [
          origem.nome, origem.categoria, origem.valor, dataDespesa.toISOString(),
          origem.periodo_recorrencia ?? 'mensal', origem.observacao ?? null,
          mes, ano, origem.despesa_id, userId, now.toISOString(),
        ])
        gerados++
      }
      return gerados
    })
  }

  async listDespesasMes({ mes, ano, categoria, userId = 1 }: {
    mes: number; ano: number; categoria?: string; userId?: number
  }) {
    await this.gerarRecorrentesDoMes(mes, ano, userId)
    return this.withSchema(async client => {
      const params: any[] = [mes, ano]
      let q = `SELECT * FROM t_despesa WHERE active_flg = true AND mes_competencia = $1 AND ano_competencia = $2`
      if (categoria) { params.push(categoria); q += ` AND categoria = $${params.length}` }
      q += ` ORDER BY data_despesa ASC`
      const r = await client.query(q, params)
      return r.rows
    })
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

    await this.withSchema(async client => {
      await client.query(
        `UPDATE t_despesa SET mes_competencia = $1, ano_competencia = $2 WHERE despesa_id = $3`,
        [mes, ano, result.despesaId]
      )
    })
    return result
  }

  async excluir(id: number, userId: number) {
    await this.db.update(dbDespesa).set({ activeFlag: false, updatedDt: new Date(), updatedBy: userId })
      .where(eq(dbDespesa.despesaId, id))
    return { ok: true }
  }

  async kpisMes(mes: number, ano: number) {
    const inicio = new Date(ano, mes - 1, 1)
    const fim    = new Date(ano, mes, 0, 23, 59, 59, 999)
    const hoje   = new Date()
    const inicioHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())

    const [receitaMes, receitaHoje, taxas] = await Promise.all([
      this.db.select({ total: sql<number>`COALESCE(SUM(total), 0)` }).from(dbVenda)
        .where(and(eq(dbVenda.activeFlag, true), gte(dbVenda.vendidaEm, inicio), lte(dbVenda.vendidaEm, fim))),
      this.db.select({ total: sql<number>`COALESCE(SUM(total), 0)` }).from(dbVenda)
        .where(and(eq(dbVenda.activeFlag, true), gte(dbVenda.vendidaEm, inicioHoje))),
      this.taxasDoPeriodo(inicio, fim),
    ])

    const despesasMes = await this.withSchema(async client => {
      const r = await client.query(
        `SELECT COALESCE(SUM(valor), 0) as total FROM t_despesa WHERE active_flg = true AND mes_competencia = $1 AND ano_competencia = $2`,
        [mes, ano]
      )
      return Number(r.rows[0]?.total ?? 0)
    })

    const receita = Number(receitaMes[0]?.total ?? 0)
    // O resultado agora considera a taxa dos meios de pagamento — ela sai do
    // caixa igual a qualquer outro custo, só que como dedução de receita.
    return {
      receitaMes:  receita,
      taxasMes:    taxas.total,
      receitaLiquidaMes: receita - taxas.total,
      despesasMes,
      resultado:   receita - taxas.total - despesasMes,
      receitaHoje: Number(receitaHoje[0]?.total ?? 0),
      mes, ano,
    }
  }

  async dreMes(mes: number, ano: number) {
    const inicio = new Date(ano, mes - 1, 1)
    const fim    = new Date(ano, mes, 0, 23, 59, 59, 999)

    const [receitaData, despesasData, gastosFixosData, taxas] = await Promise.all([
      this.db.select({ total: sql<number>`COALESCE(SUM(total), 0)`, qtd: count() }).from(dbVenda)
        .where(and(eq(dbVenda.activeFlag, true), gte(dbVenda.vendidaEm, inicio), lte(dbVenda.vendidaEm, fim))),
      this.withSchema(async client => {
        const r = await client.query(
          `SELECT categoria, COALESCE(SUM(valor), 0) as total FROM t_despesa WHERE active_flg = true AND mes_competencia = $1 AND ano_competencia = $2 GROUP BY categoria ORDER BY categoria`,
          [mes, ano]
        )
        return r.rows
      }),
      // Gastos fixos do mês também entram como despesas operacionais no DRE
      this.withSchema(async client => {
        const r = await client.query(
          `SELECT gc.nome as categoria, COALESCE(SUM(gv.valor), 0) as total
           FROM t_gasto_fixo_valor gv
           JOIN t_gasto_fixo_categoria gc ON gc.categoria_id = gv.categoria_id AND gc.active_flg = true
           WHERE gv.active_flg = true AND gv.mes = $1 AND gv.ano = $2 AND gv.valor > 0
           GROUP BY gc.nome ORDER BY gc.nome`,
          [mes, ano]
        )
        return r.rows
      }),
      this.taxasDoPeriodo(inicio, fim),
    ])

    const receita       = Number(receitaData[0]?.total ?? 0)
    const qtdVendas     = Number(receitaData[0]?.qtd ?? 0)
    const porCategoria: Record<string, number> = {}

    // Despesas avulsas
    for (const row of despesasData as any[]) {
      porCategoria[row.categoria] = Number(row.total)
    }

    // Gastos fixos — soma na categoria correspondente
    for (const row of gastosFixosData as any[]) {
      const cat = `[Fixo] ${row.categoria}`
      porCategoria[cat] = (porCategoria[cat] ?? 0) + Number(row.total)
    }

    const totalDespesas = Object.values(porCategoria).reduce((a, b) => a + b, 0)

    // Taxa de cartão é DEDUÇÃO DE RECEITA, não despesa operacional: ela não
    // entra em porCategoria nem em totalDespesas, para não distorcer a
    // comparação de custo entre categorias.
    const receitaLiquida = receita - taxas.total

    return {
      receita,
      qtdVendas,
      taxasPagamento:      taxas.total,
      taxasPorForma:       taxas.porForma,
      receitaLiquida,
      totalDespesas,
      resultado:           receitaLiquida - totalDespesas,
      porCategoria,
      mes, ano,
    }
  }

  async demonstrativo(ano: number) {
    const [vendasData, despesasData, gastos, taxasMes] = await Promise.all([
      this.withSchema(async client => {
        const r = await client.query(
          `SELECT EXTRACT(MONTH FROM vendida_em)::int as mes, COALESCE(SUM(total), 0)::bigint as receita, COUNT(*)::int as qtd FROM t_venda WHERE active_flg = true AND EXTRACT(YEAR FROM vendida_em) = $1 GROUP BY mes ORDER BY mes`,
          [ano]
        )
        return r.rows
      }),
      this.withSchema(async client => {
        const r = await client.query(
          `SELECT mes_competencia as mes, COALESCE(SUM(valor), 0)::bigint as total_despesas FROM t_despesa WHERE active_flg = true AND ano_competencia = $1 GROUP BY mes ORDER BY mes`,
          [ano]
        )
        return r.rows
      }),
      this.db.select().from(dbGastoFixoValor)
        .where(and(eq(dbGastoFixoValor.ano, ano), eq(dbGastoFixoValor.activeFlag, true))),
      this.taxasPorMes(ano),
    ])

    const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
    return meses.map((label, i) => {
      const mesNum = i + 1
      const v = (vendasData as any[]).find(r => Number(r.mes) === mesNum)
      const d = (despesasData as any[]).find(r => Number(r.mes) === mesNum)
      const fixos = gastos.filter(g => g.mes === mesNum).reduce((a, g) => a + g.valor, 0)
      const receita   = Number(v?.receita ?? 0)
      const desp      = Number(d?.total_despesas ?? 0)
      const taxas     = Number(taxasMes[mesNum] ?? 0)
      const resultado = receita - taxas - desp - fixos
      return {
        mes: label, mesNum, receita, taxas, despesas: desp, fixos, resultado,
        margem: receita > 0 ? ((resultado / receita) * 100).toFixed(1) : '0.0',
      }
    })
  }

  async copiarGastosFixosMesAnterior(mes: number, ano: number) {
    return this.withSchema(async client => {
      const mesPrev = mes === 1 ? 12 : mes - 1
      const anoPrev = mes === 1 ? ano - 1 : ano
      const valoresPrev = await client.query(
        `SELECT categoria_id, valor FROM t_gasto_fixo_valor WHERE ano = $1 AND mes = $2 AND active_flg = true AND valor > 0`,
        [anoPrev, mesPrev]
      )
      let copiados = 0
      for (const row of valoresPrev.rows) {
        await client.query(`
          INSERT INTO t_gasto_fixo_valor (categoria_id, ano, mes, valor, created_dt, updated_dt, created_by, updated_by, active_flg, modification_num)
          SELECT $1, $2, $3, $4, NOW(), NOW(), 1, 1, true, 0
          WHERE NOT EXISTS (SELECT 1 FROM t_gasto_fixo_valor WHERE categoria_id = $1 AND ano = $2 AND mes = $3)
          ON CONFLICT DO NOTHING
        `, [row.categoria_id, ano, mes, row.valor])
        copiados++
      }
      return copiados
    })
  }
}