import { and, eq, sql } from 'drizzle-orm'
import type { AppDB } from '@/lib/db/connection'
import { dbConferenciaRecebimento, dbConferenciaItem } from '@/lib/db/schemas/compras-completo'
import { dbPedidoCompra, dbPedidoCompraItem } from '@/lib/db/schemas/compras-completo'
import { dbInsumo } from '@/lib/db/schemas/cadastros'
import { ContasPagarService } from '@/lib/services/financeiro/ContasPagarService'

/**
 * ConferenciaService — fecha o fluxo de Compras fim a fim:
 *   1. Abre conferência a partir de um Pedido de Compra
 *   2. Lança as quantidades efetivamente recebidas por item
 *   3. Ao concluir: dá ENTRADA no estoque dos insumos recebidos
 *      e gera automaticamente uma CONTA A PAGAR para o fornecedor
 */
export class ConferenciaService {
  constructor(private db: AppDB) {}

  async iniciar(pedidoId: number, userId: number) {
    const now = new Date()
    const itensPedido = await this.db.select().from(dbPedidoCompraItem)
      .where(and(eq(dbPedidoCompraItem.pedidoId, pedidoId), eq(dbPedidoCompraItem.activeFlag, true)))

    if (itensPedido.length === 0) throw new Error('Pedido sem itens.')

    const [conferencia] = await this.db.insert(dbConferenciaRecebimento).values({
      pedidoId,
      dataRecebimento: now.toISOString().slice(0, 10),
      status:          'em_andamento',
      createdBy: userId, updatedBy: userId, createdDt: now, updatedDt: now,
    }).returning({ conferenciaId: dbConferenciaRecebimento.conferenciaId })

    for (const item of itensPedido) {
      await this.db.insert(dbConferenciaItem).values({
        conferenciaId:      conferencia.conferenciaId,
        pedidoItemId:       item.itemId,
        insumoId:           item.insumoId,
        nomeInsumo:         item.nomeInsumo,
        quantidadePedida:   item.quantidade,
        quantidadeRecebida: '0',
        conforme:           false,
        createdBy: userId, updatedBy: userId, createdDt: now, updatedDt: now,
      })
    }
    return conferencia
  }

  async findById(id: number) {
    const [conf] = await this.db.select().from(dbConferenciaRecebimento).where(eq(dbConferenciaRecebimento.conferenciaId, id))
    if (!conf) return null
    const itens = await this.db.select().from(dbConferenciaItem)
      .where(and(eq(dbConferenciaItem.conferenciaId, id), eq(dbConferenciaItem.activeFlag, true)))
    const conformidade = itens.length > 0
      ? Math.round((itens.filter(i => i.conforme).length / itens.length) * 100)
      : 0
    return { ...conf, itens, conformidadePct: conformidade }
  }

  async findByPedido(pedidoId: number) {
    const [conf] = await this.db.select().from(dbConferenciaRecebimento)
      .where(and(eq(dbConferenciaRecebimento.pedidoId, pedidoId), eq(dbConferenciaRecebimento.activeFlag, true)))
    if (!conf) return null
    return this.findById(conf.conferenciaId)
  }

  /** Lança a quantidade recebida de um item específico */
  async lancarItem(itemId: number, quantidadeRecebida: number, userId: number) {
    const [item] = await this.db.select().from(dbConferenciaItem).where(eq(dbConferenciaItem.itemId, itemId))
    if (!item) throw new Error('Item de conferência não encontrado')

    const conforme = quantidadeRecebida >= parseFloat(String(item.quantidadePedida))
    await this.db.update(dbConferenciaItem).set({
      quantidadeRecebida: String(quantidadeRecebida),
      conforme,
      updatedDt: new Date(), updatedBy: userId,
    }).where(eq(dbConferenciaItem.itemId, itemId))

    return { ok: true, conforme }
  }

  /**
   * Finaliza a conferência:
   *   - Dá entrada no estoque de cada insumo (soma a quantidade recebida)
   *   - Atualiza quantidade_recebida no item do pedido original
   *   - Marca o pedido como 'recebido' (ou 'recebido_parcial' se incompleto)
   *   - Gera uma Conta a Pagar para o fornecedor com o valor dos itens recebidos
   */
  async finalizar(conferenciaId: number, { gerarContaPagar = true, vencimentoContaPagar }: {
    gerarContaPagar?: boolean; vencimentoContaPagar?: string
  }, userId: number) {
    const now = new Date()
    const conf = await this.findById(conferenciaId)
    if (!conf) throw new Error('Conferência não encontrada')

    const [pedido] = await this.db.select().from(dbPedidoCompra).where(eq(dbPedidoCompra.pedidoId, conf.pedidoId))
    if (!pedido) throw new Error('Pedido de compra não encontrado')

    let valorRecebidoTotal = 0
    let totalmenteRecebido = true

    for (const item of conf.itens) {
      const qtdRecebida = parseFloat(String(item.quantidadeRecebida))
      const qtdPedida    = parseFloat(String(item.quantidadePedida))
      if (qtdRecebida < qtdPedida) totalmenteRecebido = false

      // Entrada no estoque do insumo
      if (item.insumoId && qtdRecebida > 0) {
        await this.db.update(dbInsumo).set({
          estoqueAtual: sql`${dbInsumo.estoqueAtual} + ${qtdRecebida}`,
          updatedDt: now, updatedBy: userId,
        }).where(eq(dbInsumo.insumoId, item.insumoId))
      }

      // Atualiza quantidade recebida no item do pedido original
      await this.db.update(dbPedidoCompraItem).set({
        quantidadeRecebida: String(qtdRecebida), updatedDt: now, updatedBy: userId,
      }).where(eq(dbPedidoCompraItem.itemId, item.pedidoItemId))

      // Busca preço unitário do item do pedido pra calcular valor recebido
      const [pedidoItem] = await this.db.select().from(dbPedidoCompraItem)
        .where(eq(dbPedidoCompraItem.itemId, item.pedidoItemId))
      if (pedidoItem) valorRecebidoTotal += pedidoItem.precoUnitario * qtdRecebida
    }

    // Fecha a conferência
    await this.db.update(dbConferenciaRecebimento).set({
      status: 'concluida', updatedDt: now, updatedBy: userId,
    }).where(eq(dbConferenciaRecebimento.conferenciaId, conferenciaId))

    // Atualiza status do pedido
    await this.db.update(dbPedidoCompra).set({
      status: totalmenteRecebido ? 'recebido' : 'recebido_parcial',
      updatedDt: now, updatedBy: userId,
    }).where(eq(dbPedidoCompra.pedidoId, pedido.pedidoId))

    // Gera Conta a Pagar automaticamente
    let contaPagarId: number | undefined
    if (gerarContaPagar && valorRecebidoTotal > 0) {
      const vencimento = vencimentoContaPagar
        ?? new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30).toISOString().slice(0, 10)

      const result = await new ContasPagarService(this.db).criar({
        descricao:       `Pedido de Compra #${pedido.pedidoId} — ${pedido.nomeFornecedor}`,
        nomeFornecedor:  pedido.nomeFornecedor,
        fornecedorId:    pedido.fornecedorId ?? undefined,
        categoria:       'Insumos',
        numeroDocumento: `PC-${pedido.pedidoId}`,
        valorOriginal:   valorRecebidoTotal, // já em centavos — ContasPagarService.criar não multiplica
        dataEmissao:     now.toISOString().slice(0, 10),
        dataVencimento:  vencimento,
        observacao:      `Gerado automaticamente pela conferência de recebimento #${conferenciaId}`,
      }, userId)
      contaPagarId = result.contaPagarId
    }

    return {
      ok: true,
      totalmenteRecebido,
      valorRecebidoTotal,
      contaPagarId,
    }
  }
}