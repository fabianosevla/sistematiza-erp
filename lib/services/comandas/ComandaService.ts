import { and, eq, desc, count, sql } from 'drizzle-orm'
import type { AppDB } from '@/lib/db/connection'
import { dbComanda, dbComandaItem, dbVenda, dbVendaItem, dbVendaPagamento } from '@/lib/db/schemas/vendas'
import { dbProduto } from '@/lib/db/schemas/cadastros'

export class ComandaService {
  constructor(private db: AppDB) {}

  async list({ status }: { status?: string } = {}) {
    const conditions = [eq(dbComanda.activeFlag, true)]
    if (status) conditions.push(eq(dbComanda.status, status))
    const comandas = await this.db
      .select()
      .from(dbComanda)
      .where(and(...conditions))
      .orderBy(desc(dbComanda.abertaEm))
    return comandas
  }

  async findById(id: number) {
    const [comanda] = await this.db
      .select()
      .from(dbComanda)
      .where(eq(dbComanda.comandaId, id))
    if (!comanda) return null
    const itens = await this.db
      .select()
      .from(dbComandaItem)
      .where(and(eq(dbComandaItem.comandaId, id), eq(dbComandaItem.activeFlag, true)))
    return { ...comanda, itens }
  }

  async criar({ identificacao, clienteId, userId }: {
    identificacao: string
    clienteId?: number
    userId: number
  }) {
    const now = new Date()
    const [result] = await this.db
      .insert(dbComanda)
      .values({
        identificacao,
        clienteId,
        status:    'aberta',
        total:     0,
        desconto:  0,
        abertaEm:  now,
        createdBy: userId,
        updatedBy: userId,
        createdDt: now,
        updatedDt: now,
      })
      .returning({ comandaId: dbComanda.comandaId })
    return result
  }

  async adicionarItem({ comandaId, produtoId, quantidade, observacao, userId }: {
    comandaId:  number
    produtoId:  number
    quantidade: number
    observacao?: string
    userId:     number
  }) {
    const now = new Date()

    const [produto] = await this.db
      .select()
      .from(dbProduto)
      .where(eq(dbProduto.produtoId, produtoId))
    if (!produto) throw new Error('Produto não encontrado')

    const precoUnitario = produto.precoVarejo
    const subtotal      = precoUnitario * quantidade

    // Verificar se já existe item com esse produto
    const [existente] = await this.db
      .select()
      .from(dbComandaItem)
      .where(and(
        eq(dbComandaItem.comandaId, comandaId),
        eq(dbComandaItem.produtoId, produtoId),
        eq(dbComandaItem.activeFlag, true),
      ))

    if (existente) {
      const novaQtd      = existente.quantidade + quantidade
      const novoSubtotal = precoUnitario * novaQtd
      await this.db
        .update(dbComandaItem)
        .set({ quantidade: novaQtd, subtotal: novoSubtotal, updatedDt: now, updatedBy: userId })
        .where(eq(dbComandaItem.itemId, existente.itemId))
    } else {
      await this.db
        .insert(dbComandaItem)
        .values({
          comandaId,
          produtoId,
          nomeProduto:   produto.nome,
          quantidade,
          precoUnitario,
          subtotal,
          observacao,
          createdBy:     userId,
          updatedBy:     userId,
          createdDt:     now,
          updatedDt:     now,
        })
    }

    // Recalcular total da comanda
    await this.recalcularTotal(comandaId, now, userId)
    return { ok: true }
  }

  async removerItem({ itemId, comandaId, userId }: { itemId: number; comandaId: number; userId: number }) {
    const now = new Date()
    await this.db
      .update(dbComandaItem)
      .set({ activeFlag: false, updatedDt: now, updatedBy: userId })
      .where(eq(dbComandaItem.itemId, itemId))
    await this.recalcularTotal(comandaId, now, userId)
    return { ok: true }
  }

  async recalcularTotal(comandaId: number, now: Date, userId: number) {
    const itens = await this.db
      .select()
      .from(dbComandaItem)
      .where(and(eq(dbComandaItem.comandaId, comandaId), eq(dbComandaItem.activeFlag, true)))
    const total = itens.reduce((acc, i) => acc + i.subtotal, 0)
    await this.db
      .update(dbComanda)
      .set({ total, updatedDt: now, updatedBy: userId })
      .where(eq(dbComanda.comandaId, comandaId))
  }

  async fechar({ comandaId, desconto, pagamentos, userId }: {
    comandaId:  number
    desconto:   number
    pagamentos: { forma: string; valor: number }[]
    userId:     number
  }) {
    const now = new Date()

    const comanda = await this.findById(comandaId)
    if (!comanda) throw new Error('Comanda não encontrada')
    if (comanda.status !== 'aberta') throw new Error('Comanda já fechada')

    const subtotal = comanda.total
    const total    = Math.max(0, subtotal - desconto)

    // 1. Criar venda
    const [venda] = await this.db
      .insert(dbVenda)
      .values({
        origem:    'comanda',
        comandaId,
        clienteId: comanda.clienteId,
        status:    'concluida',
        subtotal,
        desconto,
        total,
        vendidaEm: now,
        createdBy: userId,
        updatedBy: userId,
        createdDt: now,
        updatedDt: now,
      })
      .returning({ vendaId: dbVenda.vendaId })

    // 2. Criar itens da venda
    for (const item of comanda.itens) {
      await this.db.insert(dbVendaItem).values({
        vendaId:      venda.vendaId,
        produtoId:    item.produtoId,
        nomeProduto:  item.nomeProduto,
        quantidade:   item.quantidade,
        precoUnitario: item.precoUnitario,
        subtotal:     item.subtotal,
        createdBy:    userId,
        updatedBy:    userId,
        createdDt:    now,
        updatedDt:    now,
      })
    }

    // 3. Criar pagamentos
    for (const pag of pagamentos) {
      await this.db.insert(dbVendaPagamento).values({
        vendaId:   venda.vendaId,
        forma:     pag.forma,
        valor:     pag.valor,
        createdBy: userId,
        updatedBy: userId,
        createdDt: now,
        updatedDt: now,
      })
    }

    // 4. Fechar comanda
    await this.db
      .update(dbComanda)
      .set({
        status:    'fechada',
        desconto,
        total,
        vendaId:   venda.vendaId,
        fechadaEm: now,
        updatedDt: now,
        updatedBy: userId,
      })
      .where(eq(dbComanda.comandaId, comandaId))

    // 5. Baixar estoque de cada produto
    for (const item of comanda.itens) {
      await this.db
        .update(dbProduto)
        .set({
          estoqueAtual: sql`${dbProduto.estoqueAtual} - ${item.quantidade}`,
          updatedDt:    now,
          updatedBy:    userId,
        })
        .where(eq(dbProduto.produtoId, item.produtoId))
    }

    return { vendaId: venda.vendaId }
  }
    async cancelar({ comandaId, userId }: { comandaId: number; userId: number }) {
    const now = new Date()
    const [comanda] = await this.db
      .select()
      .from(dbComanda)
      .where(eq(dbComanda.comandaId, comandaId))
    if (!comanda) throw new Error('Comanda não encontrada')
    if (comanda.status !== 'aberta') throw new Error('Comanda já encerrada')
    await this.db
      .update(dbComanda)
      .set({ status: 'cancelada', fechadaEm: now, updatedDt: now, updatedBy: userId })
      .where(eq(dbComanda.comandaId, comandaId))
    return { ok: true }
  }
}