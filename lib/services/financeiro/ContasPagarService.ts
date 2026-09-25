import { and, eq, gte, lte, count, sql, or } from 'drizzle-orm'
import type { AppDB } from '@/lib/db/connection'
import { dbContaPagar, type TpDbContaPagarInsert } from '@/lib/db/schemas/financeiro-completo'

export class ContasPagarService {
  constructor(private db: AppDB) {}

  // Colunas que a listagem aceita ordenar — allowlist, nunca interpola o
  // parâmetro de ordenação direto na query (injeção de SQL via ?sort=).
  private static ORDENAVEIS: Record<string, any> = {
    descricao:       dbContaPagar.descricao,
    nomeFornecedor:  dbContaPagar.nomeFornecedor,
    dataVencimento:  dbContaPagar.dataVencimento,
    valorOriginal:   dbContaPagar.valorOriginal,
    status:          dbContaPagar.status,
  }

  async list({ status, dataInicio, dataFim, busca, page = 1, limit = 20, sort = 'dataVencimento', dir = 'desc' }: {
    status?: string; dataInicio?: string; dataFim?: string; busca?: string
    page?: number; limit?: number; sort?: string; dir?: 'asc' | 'desc'
  }) {
    const offset = (page - 1) * limit
    const conds = [eq(dbContaPagar.activeFlag, true)]

    if (status && status !== 'todas') {
      // 'vencidas' é calculado dinamicamente
      if (status === 'vencidas') {
        conds.push(
          eq(dbContaPagar.status, 'aberta'),
          sql`${dbContaPagar.dataVencimento} < CURRENT_DATE`
        )
      } else {
        conds.push(eq(dbContaPagar.status, status as any))
      }
    }
    if (dataInicio) conds.push(gte(dbContaPagar.dataVencimento, dataInicio))
    if (dataFim)    conds.push(lte(dbContaPagar.dataVencimento, dataFim))
    if (busca) {
      conds.push(
        or(
          sql`${dbContaPagar.descricao} ILIKE ${'%' + busca + '%'}`,
          sql`${dbContaPagar.nomeFornecedor} ILIKE ${'%' + busca + '%'}`,
          sql`${dbContaPagar.numeroDocumento} ILIKE ${'%' + busca + '%'}`
        )!
      )
    }
    const where = and(...conds)

    const colunaOrdem = ContasPagarService.ORDENAVEIS[sort] ?? ContasPagarService.ORDENAVEIS.dataVencimento
    const orderBy = dir === 'asc' ? sql`${colunaOrdem} ASC NULLS LAST` : sql`${colunaOrdem} DESC NULLS LAST`

    const [rows, totals] = await Promise.all([
      this.db.select().from(dbContaPagar).where(where)
        .orderBy(orderBy).limit(limit).offset(offset),
      this.db.select({ total: count() }).from(dbContaPagar).where(where),
    ])
    const total = Number(totals[0]?.total ?? 0)
    return {
      data: rows,
      meta: { total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) },
    }
  }

  async kpis() {
    const hoje = new Date().toISOString().slice(0, 10)
    const [abertas, vencidas, pagas] = await Promise.all([
      this.db.select({ total: sql<number>`COALESCE(SUM(valor_original - valor_pago), 0)`, qtd: count() })
        .from(dbContaPagar)
        .where(and(eq(dbContaPagar.activeFlag, true), eq(dbContaPagar.status, 'aberta'))),
      this.db.select({ total: sql<number>`COALESCE(SUM(valor_original - valor_pago), 0)`, qtd: count() })
        .from(dbContaPagar)
        .where(and(
          eq(dbContaPagar.activeFlag, true),
          eq(dbContaPagar.status, 'aberta'),
          sql`${dbContaPagar.dataVencimento} < ${hoje}`
        )),
      this.db.select({ total: sql<number>`COALESCE(SUM(valor_pago), 0)`, qtd: count() })
        .from(dbContaPagar)
        .where(and(eq(dbContaPagar.activeFlag, true), eq(dbContaPagar.status, 'paga'))),
    ])
    return {
      aPagar:    Number(abertas[0]?.total ?? 0),
      qtdAberta: Number(abertas[0]?.qtd   ?? 0),
      vencidas:  Number(vencidas[0]?.total ?? 0),
      qtdVencida: Number(vencidas[0]?.qtd ?? 0),
      totalPago: Number(pagas[0]?.total ?? 0),
      qtdPaga:   Number(pagas[0]?.qtd   ?? 0),
    }
  }

  async criar(payload: {
    descricao: string; nomeFornecedor?: string; fornecedorId?: number
    categoria?: string; numeroDocumento?: string
    valorOriginal: number; dataEmissao: string; dataVencimento: string
    formaPagamento?: string; observacao?: string; totalParcelas?: number
  }, userId: number) {
    const now = new Date()
    const totalParcelas = payload.totalParcelas ?? 1
    const ids: number[] = []

    for (let i = 0; i < totalParcelas; i++) {
      // Calcula vencimento de cada parcela (+30 dias por parcela)
      const dtVenc = new Date(payload.dataVencimento)
      dtVenc.setMonth(dtVenc.getMonth() + i)
      const dataVencParcela = dtVenc.toISOString().slice(0, 10)

      const [result] = await this.db.insert(dbContaPagar).values({
        descricao:       totalParcelas > 1 ? `${payload.descricao} (${i + 1}/${totalParcelas})` : payload.descricao,
        fornecedorId:    payload.fornecedorId,
        nomeFornecedor:  payload.nomeFornecedor,
        categoria:       payload.categoria,
        numeroDocumento: payload.numeroDocumento,
        valorOriginal:   Math.round(payload.valorOriginal / totalParcelas),
        dataEmissao:     payload.dataEmissao,
        dataVencimento:  dataVencParcela,
        formaPagamento:  payload.formaPagamento,
        observacao:      payload.observacao,
        parcelaAtual:    i + 1,
        totalParcelas,
        contaPaiId:      i > 0 ? ids[0] : undefined,
        createdBy: userId, updatedBy: userId, createdDt: now, updatedDt: now,
      }).returning({ id: dbContaPagar.contaPagarId })
      ids.push(result.id)
    }

    // DRE pela data da compra (QA #107): cada parcela já entra como despesa na
    // competência da emissão, ainda sem data de pagamento.
    for (const contaId of ids) {
      const [conta] = await this.db.select().from(dbContaPagar).where(eq(dbContaPagar.contaPagarId, contaId))
      if (conta) await this.lancarDespesaDaConta(conta, null, userId)
    }
    return { contaPagarId: ids[0], totalParcelas }
  }

  async atualizar(id: number, payload: Partial<TpDbContaPagarInsert>, userId: number) {
    const [result] = await this.db.update(dbContaPagar)
      .set({ ...payload, updatedDt: new Date(), updatedBy: userId })
      .where(and(eq(dbContaPagar.contaPagarId, id), eq(dbContaPagar.activeFlag, true)))
      .returning({ id: dbContaPagar.contaPagarId })

    // A despesa ligada acompanha o que mudou na conta — senão o DRE ficaria
    // com valor, nome ou mês antigos.
    if (result && (payload.descricao !== undefined || payload.categoria !== undefined
        || payload.valorOriginal !== undefined || payload.dataEmissao !== undefined)) {
      const [conta] = await this.db.select().from(dbContaPagar).where(eq(dbContaPagar.contaPagarId, id))
      if (conta) {
        const emissao = String(conta.dataEmissao ?? '').slice(0, 10)
        const dt = emissao ? new Date(`${emissao}T12:00:00`) : null
        await this.db.execute(sql`
          UPDATE t_despesa
             SET nome = ${conta.descricao}, categoria = ${conta.categoria ?? 'Outros'},
                 valor = ${conta.valorOriginal},
                 data_despesa    = COALESCE(${emissao || null}::date, data_despesa),
                 mes_competencia = COALESCE(${dt ? dt.getMonth() + 1 : null}::int, mes_competencia),
                 ano_competencia = COALESCE(${dt ? dt.getFullYear() : null}::int, ano_competencia),
                 updated_dt = NOW(), updated_by = ${userId}
           WHERE conta_pagar_id = ${id} AND active_flg = true
        `)
      }
    }
    return result ?? null
  }

  async baixar(id: number, { valorPago, dataPagamento, formaPagamento, contaBancariaId }: {
    valorPago: number; dataPagamento: string; formaPagamento?: string; contaBancariaId?: number
  }, userId: number) {
    const [conta] = await this.db.select().from(dbContaPagar)
      .where(and(eq(dbContaPagar.contaPagarId, id), eq(dbContaPagar.activeFlag, true)))
    if (!conta) throw new Error('Conta a pagar não encontrada')

    const novoValorPago  = conta.valorPago + valorPago
    const pago           = novoValorPago >= conta.valorOriginal
    const novoStatus     = pago ? 'paga' : 'aberta'

    const [result] = await this.db.update(dbContaPagar).set({
      valorPago:       novoValorPago,
      dataPagamento:   pago ? dataPagamento : conta.dataPagamento,
      status:          novoStatus,
      formaPagamento:  formaPagamento ?? conta.formaPagamento,
      contaBancariaId: contaBancariaId ?? conta.contaBancariaId,
      updatedDt:       new Date(), updatedBy: userId,
    }).where(eq(dbContaPagar.contaPagarId, id))
      .returning({ id: dbContaPagar.contaPagarId, status: dbContaPagar.status })

    // DRE PELA DATA DA COMPRA, CAIXA PELA DATA DO PAGAMENTO (QA #107).
    //
    // A despesa já nasceu com a conta (compra a prazo ou conta lançada à mão),
    // na competência da emissão. A quitação só preenche data_pagamento — o
    // mês do DRE não muda. Conta antiga, de antes dessa regra, sem despesa
    // ligada: a despesa é criada aqui, ainda na competência da emissão.
    //
    // Só na quitação total: pagamento parcial soma em valor_pago e a conta
    // segue aberta.
    let despesaId: number | null = null
    if (pago) despesaId = await this.lancarDespesaDaConta(conta, dataPagamento, userId)

    return { ...result, despesaId }
  }

  /**
   * Garante a despesa de uma conta a pagar em t_despesa.
   *
   * `conta_pagar_id` é a trava: preenchida, a despesa daquela conta já existe e
   * uma segunda chamada não duplica — só atualiza data_pagamento quando ele vem.
   */
  private async lancarDespesaDaConta(
    conta: any,
    dataPagamento: string | null,
    userId: number,
  ): Promise<number | null> {
    const jaExiste = await this.db.execute(sql`
      SELECT despesa_id FROM t_despesa
       WHERE conta_pagar_id = ${conta.contaPagarId} AND active_flg = true
       LIMIT 1
    `)
    const existente = (jaExiste.rows as any[])[0]
    if (existente) {
      if (dataPagamento) {
        await this.db.execute(sql`
          UPDATE t_despesa SET data_pagamento = ${dataPagamento}::date,
                 updated_dt = NOW(), updated_by = ${userId}
           WHERE despesa_id = ${existente.despesa_id}
        `)
      }
      return Number(existente.despesa_id)
    }

    // DUAS DATAS: a compra é a emissão do título; o pagamento é a baixa.
    // A competência acompanha a EMISSÃO — o mês da compra (QA #107).
    const emissao = String(conta.dataEmissao ?? '').slice(0, 10) || dataPagamento
    if (!emissao) return null
    const dt = new Date(`${emissao}T12:00:00`)

    // mes_competencia e ano_competencia existem na tabela mas não estão
    // declaradas no schema do Drizzle — entraram por script de migração. O
    // ComprasService também as preenche; omitir aqui quebraria se forem NOT NULL.
    const res = await this.db.execute(sql`
      INSERT INTO t_despesa
        (nome, categoria, valor, data_despesa, data_pagamento, recorrente,
         mes_competencia, ano_competencia, observacao, conta_pagar_id,
         created_by, updated_by, created_dt, updated_dt, active_flg, modification_num)
      VALUES
        (${conta.descricao}, ${conta.categoria ?? 'Outros'}, ${conta.valorOriginal},
         ${emissao}::date, ${dataPagamento}::date, false,
         ${dt.getMonth() + 1}, ${dt.getFullYear()},
         ${`Conta a pagar #${conta.contaPagarId}`}, ${conta.contaPagarId},
         ${userId}, ${userId}, NOW(), NOW(), true, 0)
      RETURNING despesa_id
    `)
    return Number((res.rows as any[])[0]?.despesa_id) || null
  }

  async excluir(id: number, userId: number) {
    await this.db.update(dbContaPagar).set({ activeFlag: false, updatedDt: new Date(), updatedBy: userId })
      .where(eq(dbContaPagar.contaPagarId, id))
    // Conta excluída não pode continuar pesando no DRE.
    await this.db.execute(sql`
      UPDATE t_despesa SET active_flg = false, updated_dt = NOW(), updated_by = ${userId}
       WHERE conta_pagar_id = ${id} AND active_flg = true
    `)
    return { ok: true }
  }
}