import { and, eq, desc } from 'drizzle-orm'
import type { AppDB } from '@/lib/db/connection'
import { dbListaCompra, dbListaCompraItem } from '@/lib/db/schemas/compras-completo'

export class ListaComprasService {
  constructor(private db: AppDB) {}

  async list({ status }: { status?: string } = {}) {
    const conds = [eq(dbListaCompra.activeFlag, true)]
    if (status && status !== 'todas') conds.push(eq(dbListaCompra.status, status))
    const listas = await this.db.select().from(dbListaCompra)
      .where(and(...conds)).orderBy(desc(dbListaCompra.dataGeracao))

    const result = []
    for (const l of listas) {
      const itens = await this.db.select().from(dbListaCompraItem)
        .where(and(eq(dbListaCompraItem.listaId, l.listaId), eq(dbListaCompraItem.activeFlag, true)))
      result.push({ ...l, itens, totalItens: itens.length })
    }
    return result
  }

  async findById(id: number) {
    const [lista] = await this.db.select().from(dbListaCompra).where(eq(dbListaCompra.listaId, id))
    if (!lista) return null
    const itens = await this.db.select().from(dbListaCompraItem)
      .where(and(eq(dbListaCompraItem.listaId, id), eq(dbListaCompraItem.activeFlag, true)))
    return { ...lista, itens }
  }

  async criar(payload: {
    descricao?: string; previsaoEntrega?: string; previsaoPagamento?: string
    itens: { insumoId: number; nomeInsumo: string; quantidadeSugerida: number; estoqueNoMomento?: number }[]
    userId: number
  }) {
    const now = new Date()
    const [lista] = await this.db.insert(dbListaCompra).values({
      descricao:         payload.descricao,
      dataGeracao:       now.toISOString().slice(0, 10),
      previsaoEntrega:   payload.previsaoEntrega,
      previsaoPagamento: payload.previsaoPagamento,
      origem:            'manual',
      status:            'aberta',
      createdBy: payload.userId, updatedBy: payload.userId, createdDt: now, updatedDt: now,
    }).returning({ listaId: dbListaCompra.listaId })

    for (const item of payload.itens) {
      await this.db.insert(dbListaCompraItem).values({
        listaId:            lista.listaId,
        insumoId:           item.insumoId,
        nomeInsumo:         item.nomeInsumo,
        quantidadeSugerida: String(item.quantidadeSugerida),
        estoqueNoMomento:   String(item.estoqueNoMomento ?? 0),
        createdBy: payload.userId, updatedBy: payload.userId, createdDt: now, updatedDt: now,
      })
    }
    return lista
  }

  async atualizarStatus(id: number, status: string, userId: number) {
    await this.db.update(dbListaCompra).set({ status, updatedDt: new Date(), updatedBy: userId })
      .where(eq(dbListaCompra.listaId, id))
    return { ok: true }
  }

  async excluir(id: number, userId: number) {
    await this.db.update(dbListaCompra).set({ activeFlag: false, updatedDt: new Date(), updatedBy: userId })
      .where(eq(dbListaCompra.listaId, id))
    return { ok: true }
  }
}