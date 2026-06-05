import { and, eq, desc } from 'drizzle-orm'
import type { AppDB } from '@/lib/db/connection'
import { dbPedido, dbPedidoItem } from '@/lib/db/schemas/producao'
import { dbProduto } from '@/lib/db/schemas/cadastros'

export class PedidoService {
  constructor(private db: AppDB) {}

  async list({ status }: { status?: string } = {}) {
    const conditions = [eq(dbPedido.activeFlag, true)]
    if (status) conditions.push(eq(dbPedido.status, status))
    return this.db
      .select()
      .from(dbPedido)
      .where(and(...conditions))
      .orderBy(desc(dbPedido.dataPedido))
  }

  async findById(id: number) {
    const [pedido] = await this.db.select().from(dbPedido).where(eq(dbPedido.pedidoId, id))
    if (!pedido) return null
    const itens = await this.db.select().from(dbPedidoItem).where(and(
      eq(dbPedidoItem.pedidoId, id),
      eq(dbPedidoItem.activeFlag, true),
    ))
    return { ...pedido, itens }
  }

  async criar({ clienteId, tipoVenda, dataPedido, previsaoProducao, previsaoEntrega, valorEntrega, enderecoEntrega, observacao, itens, userId }: {
    clienteId?:        number
    tipoVenda:         string
    dataPedido:        string
    previsaoProducao?: string
    previsaoEntrega?:  string
    valorEntrega:      number
    enderecoEntrega?:  string
    observacao?:       string
    itens:             { produtoId: number; quantidade: number; precoUnitario: number }[]
    userId:            number
  }) {
    const now = new Date()

    const [pedido] = await this.db.insert(dbPedido).values({
      clienteId:        clienteId ?? null,
      tipoVenda,
      status:           'pendente',
      dataPedido:       new Date(dataPedido),
      previsaoProducao: previsaoProducao ? new Date(previsaoProducao) : null,
      previsaoEntrega:  previsaoEntrega  ? new Date(previsaoEntrega)  : null,
      valorEntrega,
      enderecoEntrega:  enderecoEntrega ?? null,
      observacao:       observacao ?? null,
      createdBy:        userId,
      updatedBy:        userId,
      createdDt:        now,
      updatedDt:        now,
    }).returning({ pedidoId: dbPedido.pedidoId })

    for (const item of itens) {
      const [produto] = await this.db.select().from(dbProduto).where(eq(dbProduto.produtoId, item.produtoId))
      await this.db.insert(dbPedidoItem).values({
        pedidoId:      pedido.pedidoId,
        produtoId:     item.produtoId,
        nomeProduto:   produto?.nome ?? '',
        quantidade:    item.quantidade,
        precoUnitario: item.precoUnitario,
        subtotal:      item.quantidade * item.precoUnitario,
        createdBy:     userId,
        updatedBy:     userId,
        createdDt:     now,
        updatedDt:     now,
      })
    }

    return { pedidoId: pedido.pedidoId }
  }

  async atualizarStatus(id: number, status: string, userId: number) {
    await this.db.update(dbPedido).set({
      status, updatedDt: new Date(), updatedBy: userId,
    }).where(eq(dbPedido.pedidoId, id))
    return { ok: true }
  }

  async excluir(id: number, userId: number) {
    const now = new Date()
    await this.db.update(dbPedido).set({ activeFlag: false, updatedDt: now, updatedBy: userId })
      .where(eq(dbPedido.pedidoId, id))
    await this.db.update(dbPedidoItem).set({ activeFlag: false, updatedDt: now, updatedBy: userId })
      .where(eq(dbPedidoItem.pedidoId, id))
    return { ok: true }
  }
}