import { and, eq } from 'drizzle-orm'
import type { AppDB } from '@/lib/db/connection'
import { dbCotacao, dbCotacaoItem, dbListaCompraItem } from '@/lib/db/schemas/compras-completo'
import { dbPedidoCompra, dbPedidoCompraItem } from '@/lib/db/schemas/compras-completo'

export class CotacaoService {
  constructor(private db: AppDB) {}

  /** Cria uma cotação vazia a partir de uma lista de compras, pré-populando os insumos */
  async criarDeLista(listaId: number, userId: number) {
    const now = new Date()
    const [cotacao] = await this.db.insert(dbCotacao).values({
      listaId, status: 'pendente',
      createdBy: userId, updatedBy: userId, createdDt: now, updatedDt: now,
    }).returning({ cotacaoId: dbCotacao.cotacaoId })
    return cotacao
  }

  async findByLista(listaId: number) {
    const [cotacao] = await this.db.select().from(dbCotacao)
      .where(and(eq(dbCotacao.listaId, listaId), eq(dbCotacao.activeFlag, true)))
    if (!cotacao) return null
    const itens = await this.db.select().from(dbCotacaoItem)
      .where(and(eq(dbCotacaoItem.cotacaoId, cotacao.cotacaoId), eq(dbCotacaoItem.activeFlag, true)))
    return { ...cotacao, itens }
  }

  async findById(cotacaoId: number) {
    const [cotacao] = await this.db.select().from(dbCotacao)
      .where(and(eq(dbCotacao.cotacaoId, cotacaoId), eq(dbCotacao.activeFlag, true)))
    if (!cotacao) return null
    const itens = await this.db.select().from(dbCotacaoItem)
      .where(and(eq(dbCotacaoItem.cotacaoId, cotacao.cotacaoId), eq(dbCotacaoItem.activeFlag, true)))
    return { ...cotacao, itens }
  }

  /** Adiciona um preço de fornecedor para um insumo dentro da cotação */
  async addPreco(payload: {
    cotacaoId: number; insumoId: number; nomeInsumo: string
    fornecedorId?: number; nomeFornecedor: string
    precoUnitario: number; quantidade: number; userId: number
  }) {
    const now = new Date()
    const [item] = await this.db.insert(dbCotacaoItem).values({
      cotacaoId:      payload.cotacaoId,
      insumoId:       payload.insumoId,
      nomeInsumo:     payload.nomeInsumo,
      fornecedorId:   payload.fornecedorId,
      nomeFornecedor: payload.nomeFornecedor,
      precoUnitario:  payload.precoUnitario,
      quantidade:     String(payload.quantidade),
      createdBy: payload.userId, updatedBy: payload.userId, createdDt: now, updatedDt: now,
    }).returning({ itemId: dbCotacaoItem.itemId })
    return item
  }

  async removerPreco(itemId: number, userId: number) {
    await this.db.update(dbCotacaoItem).set({ activeFlag: false, updatedDt: new Date(), updatedBy: userId })
      .where(eq(dbCotacaoItem.itemId, itemId))
    return { ok: true }
  }

  /** Marca um item (preço de um fornecedor para um insumo) como selecionado/melhor preço */
  async selecionarMelhor(cotacaoId: number, insumoId: number, itemIdSelecionado: number, userId: number) {
    const now = new Date()
    // Desmarca todos os outros itens deste insumo nesta cotação
    const itensDoInsumo = await this.db.select().from(dbCotacaoItem)
      .where(and(eq(dbCotacaoItem.cotacaoId, cotacaoId), eq(dbCotacaoItem.insumoId, insumoId), eq(dbCotacaoItem.activeFlag, true)))
    for (const item of itensDoInsumo) {
      await this.db.update(dbCotacaoItem)
        .set({ selecionado: item.itemId === itemIdSelecionado, updatedDt: now, updatedBy: userId })
        .where(eq(dbCotacaoItem.itemId, item.itemId))
    }
    return { ok: true }
  }

  /**
   * Gera Pedido(s) de Compra a partir dos itens selecionados na cotação,
   * agrupando por fornecedor (um pedido por fornecedor).
   */
  async gerarPedidos(cotacaoId: number, userId: number) {
    const itensSelecionados = await this.db.select().from(dbCotacaoItem)
      .where(and(eq(dbCotacaoItem.cotacaoId, cotacaoId), eq(dbCotacaoItem.selecionado, true), eq(dbCotacaoItem.activeFlag, true)))

    if (itensSelecionados.length === 0) {
      throw new Error('Nenhum item com fornecedor selecionado. Escolha o melhor preço para cada insumo antes de gerar o pedido.')
    }

    const [cotacao] = await this.db.select().from(dbCotacao).where(eq(dbCotacao.cotacaoId, cotacaoId))

    // Agrupa por fornecedor
    const porFornecedor: Record<string, typeof itensSelecionados> = {}
    for (const item of itensSelecionados) {
      const chave = item.nomeFornecedor
      if (!porFornecedor[chave]) porFornecedor[chave] = []
      porFornecedor[chave].push(item)
    }

    const now = new Date()
    const pedidosCriados: number[] = []

    for (const [nomeFornecedor, itens] of Object.entries(porFornecedor)) {
      const valorTotal = itens.reduce((a, i) => a + i.precoUnitario * parseFloat(String(i.quantidade)), 0)

      const [pedido] = await this.db.insert(dbPedidoCompra).values({
        listaId:         cotacao?.listaId,
        fornecedorId:    itens[0].fornecedorId,
        nomeFornecedor,
        dataPedido:      now.toISOString().slice(0, 10),
        status:          'aberto',
        valorTotal:      Math.round(valorTotal),
        observacao:      `Gerado a partir da cotação #${cotacaoId}`,
        createdBy: userId, updatedBy: userId, createdDt: now, updatedDt: now,
      }).returning({ pedidoId: dbPedidoCompra.pedidoId })

      for (const item of itens) {
        const qtd = parseFloat(String(item.quantidade))
        await this.db.insert(dbPedidoCompraItem).values({
          pedidoId:      pedido.pedidoId,
          insumoId:      item.insumoId,
          nomeInsumo:    item.nomeInsumo,
          quantidade:    String(qtd),
          precoUnitario: item.precoUnitario,
          subtotal:      Math.round(item.precoUnitario * qtd),
          createdBy: userId, updatedBy: userId, createdDt: now, updatedDt: now,
        })
      }
      pedidosCriados.push(pedido.pedidoId)
    }

    await this.db.update(dbCotacao).set({ status: 'concluida', updatedDt: now, updatedBy: userId })
      .where(eq(dbCotacao.cotacaoId, cotacaoId))

    return { pedidosCriados, totalPedidos: pedidosCriados.length }
  }
}