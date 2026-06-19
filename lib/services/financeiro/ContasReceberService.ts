import { and, eq, gte, lte, desc, count, sql, or } from 'drizzle-orm'
import type { AppDB } from '@/lib/db/connection'
import { dbContaReceber, type TpDbContaReceberInsert } from '@/lib/db/schemas/financeiro-completo'

export class ContasReceberService {
  constructor(private db: AppDB) {}

  async list({ status, dataInicio, dataFim, busca, page = 1, limit = 20 }: {
    status?: string; dataInicio?: string; dataFim?: string; busca?: string
    page?: number; limit?: number
  }) {
    const offset = (page - 1) * limit
    const conds = [eq(dbContaReceber.activeFlag, true)]

    if (status && status !== 'todas') {
      if (status === 'vencidas') {
        conds.push(eq(dbContaReceber.status, 'aberta'), sql`${dbContaReceber.dataVencimento} < CURRENT_DATE`)
      } else {
        conds.push(eq(dbContaReceber.status, status as any))
      }
    }
    if (dataInicio) conds.push(gte(dbContaReceber.dataVencimento, dataInicio))
    if (dataFim)    conds.push(lte(dbContaReceber.dataVencimento, dataFim))
    if (busca) {
      conds.push(or(
        sql`${dbContaReceber.descricao} ILIKE ${'%' + busca + '%'}`,
        sql`${dbContaReceber.nomeCliente} ILIKE ${'%' + busca + '%'}`,
        sql`${dbContaReceber.numeroDocumento} ILIKE ${'%' + busca + '%'}`
      )!)
    }
    const where = and(...conds)
    const [rows, totals] = await Promise.all([
      this.db.select().from(dbContaReceber).where(where)
        .orderBy(desc(dbContaReceber.dataVencimento)).limit(limit).offset(offset),
      this.db.select({ total: count() }).from(dbContaReceber).where(where),
    ])
    return { data: rows, meta: { total: Number(totals[0]?.total ?? 0), page, limit } }
  }

  async kpis() {
    const hoje = new Date().toISOString().slice(0, 10)
    const [abertas, vencidas, recebidas] = await Promise.all([
      this.db.select({ total: sql<number>`COALESCE(SUM(valor_original - valor_recebido), 0)`, qtd: count() })
        .from(dbContaReceber).where(and(eq(dbContaReceber.activeFlag, true), eq(dbContaReceber.status, 'aberta'))),
      this.db.select({ total: sql<number>`COALESCE(SUM(valor_original - valor_recebido), 0)`, qtd: count() })
        .from(dbContaReceber).where(and(
          eq(dbContaReceber.activeFlag, true), eq(dbContaReceber.status, 'aberta'),
          sql`${dbContaReceber.dataVencimento} < ${hoje}`
        )),
      this.db.select({ total: sql<number>`COALESCE(SUM(valor_recebido), 0)`, qtd: count() })
        .from(dbContaReceber).where(and(eq(dbContaReceber.activeFlag, true), eq(dbContaReceber.status, 'recebida'))),
    ])
    return {
      aReceber:     Number(abertas[0]?.total   ?? 0),
      qtdAberta:    Number(abertas[0]?.qtd     ?? 0),
      vencidas:     Number(vencidas[0]?.total  ?? 0),
      qtdVencida:   Number(vencidas[0]?.qtd    ?? 0),
      totalRecebido: Number(recebidas[0]?.total ?? 0),
      qtdRecebida:  Number(recebidas[0]?.qtd   ?? 0),
    }
  }

  async criar(payload: {
    descricao: string; nomeCliente?: string; clienteId?: number
    categoria?: string; numeroDocumento?: string
    valorOriginal: number; dataEmissao: string; dataVencimento: string
    formaRecebimento?: string; observacao?: string; totalParcelas?: number
  }, userId: number) {
    const now = new Date()
    const totalParcelas = payload.totalParcelas ?? 1
    const ids: number[] = []

    for (let i = 0; i < totalParcelas; i++) {
      const dtVenc = new Date(payload.dataVencimento)
      dtVenc.setMonth(dtVenc.getMonth() + i)
      const dataVencParcela = dtVenc.toISOString().slice(0, 10)

      const [result] = await this.db.insert(dbContaReceber).values({
        descricao:       totalParcelas > 1 ? `${payload.descricao} (${i + 1}/${totalParcelas})` : payload.descricao,
        clienteId:       payload.clienteId,
        nomeCliente:     payload.nomeCliente,
        categoria:       payload.categoria,
        numeroDocumento: payload.numeroDocumento,
        valorOriginal:   Math.round(payload.valorOriginal / totalParcelas),
        dataEmissao:     payload.dataEmissao,
        dataVencimento:  dataVencParcela,
        formaRecebimento: payload.formaRecebimento,
        observacao:      payload.observacao,
        parcelaAtual:    i + 1,
        totalParcelas,
        contaPaiId:      i > 0 ? ids[0] : undefined,
        createdBy: userId, updatedBy: userId, createdDt: now, updatedDt: now,
      }).returning({ id: dbContaReceber.contaReceberId })
      ids.push(result.id)
    }
    return { contaReceberId: ids[0], totalParcelas }
  }

  async baixar(id: number, { valorRecebido, dataRecebimento, formaRecebimento, contaBancariaId }: {
    valorRecebido: number; dataRecebimento: string; formaRecebimento?: string; contaBancariaId?: number
  }, userId: number) {
    const [conta] = await this.db.select().from(dbContaReceber)
      .where(and(eq(dbContaReceber.contaReceberId, id), eq(dbContaReceber.activeFlag, true)))
    if (!conta) throw new Error('Conta a receber não encontrada')

    const novoValor  = conta.valorRecebido + valorRecebido
    const recebido   = novoValor >= conta.valorOriginal
    const novoStatus = recebido ? 'recebida' : 'aberta'

    const [result] = await this.db.update(dbContaReceber).set({
      valorRecebido:    novoValor,
      dataRecebimento:  recebido ? dataRecebimento : conta.dataRecebimento,
      status:           novoStatus,
      formaRecebimento: formaRecebimento ?? conta.formaRecebimento,
      contaBancariaId:  contaBancariaId  ?? conta.contaBancariaId,
      updatedDt: new Date(), updatedBy: userId,
    }).where(eq(dbContaReceber.contaReceberId, id))
      .returning({ id: dbContaReceber.contaReceberId, status: dbContaReceber.status })
    return result
  }

  async excluir(id: number, userId: number) {
    await this.db.update(dbContaReceber).set({ activeFlag: false, updatedDt: new Date(), updatedBy: userId })
      .where(eq(dbContaReceber.contaReceberId, id))
    return { ok: true }
  }
}