import { and, eq, gte, lte, desc, count, sql, or } from 'drizzle-orm'
import type { AppDB } from '@/lib/db/connection'
import { dbContaPagar, type TpDbContaPagarInsert } from '@/lib/db/schemas/financeiro-completo'

export class ContasPagarService {
  constructor(private db: AppDB) {}

  async list({ status, dataInicio, dataFim, busca, page = 1, limit = 20 }: {
    status?: string; dataInicio?: string; dataFim?: string; busca?: string
    page?: number; limit?: number
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

    const [rows, totals] = await Promise.all([
      this.db.select().from(dbContaPagar).where(where)
        .orderBy(desc(dbContaPagar.dataVencimento)).limit(limit).offset(offset),
      this.db.select({ total: count() }).from(dbContaPagar).where(where),
    ])
    return {
      data: rows,
      meta: { total: Number(totals[0]?.total ?? 0), page, limit },
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
    return { contaPagarId: ids[0], totalParcelas }
  }

  async atualizar(id: number, payload: Partial<TpDbContaPagarInsert>, userId: number) {
    const [result] = await this.db.update(dbContaPagar)
      .set({ ...payload, updatedDt: new Date(), updatedBy: userId })
      .where(and(eq(dbContaPagar.contaPagarId, id), eq(dbContaPagar.activeFlag, true)))
      .returning({ id: dbContaPagar.contaPagarId })
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
    return result
  }

  async excluir(id: number, userId: number) {
    await this.db.update(dbContaPagar).set({ activeFlag: false, updatedDt: new Date(), updatedBy: userId })
      .where(eq(dbContaPagar.contaPagarId, id))
    return { ok: true }
  }
}