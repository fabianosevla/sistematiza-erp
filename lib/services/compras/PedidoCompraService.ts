import { and, eq, desc } from 'drizzle-orm'
import type { AppDB } from '@/lib/db/connection'
import { dbPedidoCompra, dbPedidoCompraItem } from '@/lib/db/schemas/compras-completo'

export class PedidoCompraService {
  constructor(private db: AppDB) {}

  async list({ status }: { status?: string } = {}) {
    const conds = [eq(dbPedidoCompra.activeFlag, true)]
    if (status && status !== 'todas') conds.push(eq(dbPedidoCompra.status, status))
    const pedidos = await this.db.select().from(dbPedidoCompra)
      .where(and(...conds)).orderBy(desc(dbPedidoCompra.dataPedido))

    const result = []
    for (const p of pedidos) {
      const itens = await this.db.select().from(dbPedidoCompraItem)
        .where(and(eq(dbPedidoCompraItem.pedidoId, p.pedidoId), eq(dbPedidoCompraItem.activeFlag, true)))
      result.push({ ...p, itens, totalItens: itens.length })
    }
    return result
  }

  async findById(id: number) {
    const [pedido] = await this.db.select().from(dbPedidoCompra).where(eq(dbPedidoCompra.pedidoId, id))
    if (!pedido) return null
    const itens = await this.db.select().from(dbPedidoCompraItem)
      .where(and(eq(dbPedidoCompraItem.pedidoId, id), eq(dbPedidoCompraItem.activeFlag, true)))
    return { ...pedido, itens }
  }

  /** Cria um pedido manual (sem passar por cotação) */
  async criar(payload: {
    listaId?: number; fornecedorId?: number; nomeFornecedor: string
    previsaoEntrega?: string; observacao?: string
    itens: { insumoId?: number; nomeInsumo: string; quantidade: number; precoUnitario: number }[]
    userId: number
  }) {
    const now = new Date()
    const valorTotal = payload.itens.reduce((a, i) => a + i.precoUnitario * i.quantidade, 0)

    const [pedido] = await this.db.insert(dbPedidoCompra).values({
      listaId:         payload.listaId,
      fornecedorId:    payload.fornecedorId,
      nomeFornecedor:  payload.nomeFornecedor,
      dataPedido:      now.toISOString().slice(0, 10),
      previsaoEntrega: payload.previsaoEntrega,
      status:          'aberto',
      valorTotal:      Math.round(valorTotal),
      observacao:      payload.observacao,
      createdBy: payload.userId, updatedBy: payload.userId, createdDt: now, updatedDt: now,
    }).returning({ pedidoId: dbPedidoCompra.pedidoId })

    for (const item of payload.itens) {
      await this.db.insert(dbPedidoCompraItem).values({
        pedidoId:      pedido.pedidoId,
        insumoId:      item.insumoId,
        nomeInsumo:    item.nomeInsumo,
        quantidade:    String(item.quantidade),
        precoUnitario: item.precoUnitario,
        subtotal:      Math.round(item.precoUnitario * item.quantidade),
        createdBy: payload.userId, updatedBy: payload.userId, createdDt: now, updatedDt: now,
      })
    }
    return pedido
  }

  async cancelar(id: number, userId: number) {
    await this.db.update(dbPedidoCompra).set({ status: 'cancelado', updatedDt: new Date(), updatedBy: userId })
      .where(eq(dbPedidoCompra.pedidoId, id))
    return { ok: true }
  }

  async excluir(id: number, userId: number) {
    await this.db.update(dbPedidoCompra).set({ activeFlag: false, updatedDt: new Date(), updatedBy: userId })
      .where(eq(dbPedidoCompra.pedidoId, id))
    return { ok: true }
  }
}