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
    // Base e ajustes chegam já em centavos, como valorOriginal.
    valorBase?: number; desconto?: number; acrescimo?: number
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
        // Base e ajustes acompanham a divisão em parcelas, senão a soma das
        // parcelas não bateria com a base gravada em cada uma.
        valorBase:       Math.round((payload.valorBase ?? payload.valorOriginal) / totalParcelas),
        desconto:        Math.round((payload.desconto  ?? 0) / totalParcelas),
        acrescimo:       Math.round((payload.acrescimo ?? 0) / totalParcelas),
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

    // A VENDA NASCE AQUI, não na entrega.
    //
    // Entregar move mercadoria e abre cobrança. Faturar é outra coisa: só
    // acontece quando o dinheiro entra. Antes a venda era criada junto com a
    // entrega, e o relatório mostrava faturamento de pedido que ninguém tinha
    // pagado ainda.
    //
    // Só na quitação total. Baixa parcial vai somando em valor_recebido e a
    // conta segue aberta — uma conta, uma venda.
    let vendaId: number | null = null
    if (recebido && conta.origem === 'pedido' && conta.origemId) {
      vendaId = await this.gerarVendaDoPedido(
        conta.origemId,
        { total: conta.valorOriginal, forma: formaRecebimento ?? conta.formaRecebimento ?? null },
        userId,
      )
    }

    return { ...result, vendaId }
  }

  /**
   * Cria a venda de um pedido já entregue e pago.
   *
   * NÃO mexe em estoque. O produto acabado saiu na entrega, com movimentação
   * registrada, e o insumo saiu antes ainda, no registro de produção. Baixar
   * de novo aqui tiraria a mesma mercadoria três vezes.
   *
   * `t_pedido.venda_id` serve de trava: preenchido, o pedido já foi faturado e
   * uma segunda baixa não duplica a venda.
   *
   * Devolve o id da venda criada, ou null se não havia o que faturar.
   */
  private async gerarVendaDoPedido(
    pedidoId: number,
    { total, forma }: { total: number; forma: string | null },
    userId: number,
  ): Promise<number | null> {
    const ped = await this.db.execute(sql`
      SELECT pedido_id, cliente_id, nome_cliente_avulso, tipo_venda,
             endereco_entrega, observacao, venda_id
        FROM t_pedido
       WHERE pedido_id = ${pedidoId} AND active_flg = true
       LIMIT 1
    `)
    const pedido = (ped.rows as any[])[0]
    if (!pedido || pedido.venda_id) return null

    const itensRes = await this.db.execute(sql`
      SELECT produto_id, nome_produto, quantidade, preco_unitario, subtotal
        FROM t_pedido_item
       WHERE pedido_id = ${pedidoId} AND active_flg = true
    `)
    const itens = itensRes.rows as any[]
    if (itens.length === 0) return null

    const subtotal = itens.reduce((a, i) => a + Number(i.subtotal ?? 0), 0)
    // A diferença entre o cobrado e a soma dos itens é a taxa de entrega, que
    // no pedido é somada por fora. Vai como desconto negativo, do mesmo jeito
    // que o PDV trata acréscimo — assim subtotal - desconto = total continua
    // verdadeiro em todo relatório.
    const desconto = subtotal - total

    const vendaRes = await this.db.execute(sql`
      INSERT INTO t_venda (
        origem, cliente_id, nome_cliente_avulso, status, tipo_entrega,
        data_entrega, endereco_entrega, subtotal, desconto, total,
        observacao, vendida_em,
        created_by, updated_by, created_dt, updated_dt, active_flg, modification_num
      ) VALUES (
        'pedido', ${pedido.cliente_id}, ${pedido.nome_cliente_avulso}, 'concluida',
        ${pedido.tipo_venda === 'balcao' ? 'Retirada' : 'Entrega'},
        NOW(), ${pedido.endereco_entrega}, ${subtotal}, ${desconto}, ${total},
        ${`Pedido #${pedidoId}${pedido.observacao ? ' — ' + pedido.observacao : ''}`}, NOW(),
        ${userId}, ${userId}, NOW(), NOW(), true, 0
      )
      RETURNING venda_id
    `)
    const vendaId = Number((vendaRes.rows as any[])[0]?.venda_id)
    if (!vendaId) return null

    for (const it of itens) {
      await this.db.execute(sql`
        INSERT INTO t_venda_item (
          venda_id, produto_id, nome_produto, quantidade, preco_unitario, desconto, subtotal,
          created_by, updated_by, created_dt, updated_dt, active_flg, modification_num
        ) VALUES (
          ${vendaId}, ${it.produto_id}, ${it.nome_produto}, ${it.quantidade},
          ${it.preco_unitario}, 0, ${it.subtotal},
          ${userId}, ${userId}, NOW(), NOW(), true, 0
        )
      `)
    }

    if (forma) {
      await this.db.execute(sql`
        INSERT INTO t_venda_pagamento (
          venda_id, forma, valor,
          created_by, updated_by, created_dt, updated_dt, active_flg, modification_num
        ) VALUES (
          ${vendaId}, ${forma}, ${total},
          ${userId}, ${userId}, NOW(), NOW(), true, 0
        )
      `)
    }

    await this.db.execute(sql`
      UPDATE t_pedido SET venda_id = ${vendaId}, updated_dt = NOW()
       WHERE pedido_id = ${pedidoId}
    `)

    return vendaId
  }

  async excluir(id: number, userId: number) {
    await this.db.update(dbContaReceber).set({ activeFlag: false, updatedDt: new Date(), updatedBy: userId })
      .where(eq(dbContaReceber.contaReceberId, id))
    return { ok: true }
  }
}