import { and, eq, gte, lte, desc, count, sql } from 'drizzle-orm'
import type { AppDB } from '@/lib/db/connection'
import { dbVenda, dbVendaItem, dbVendaPagamento } from '@/lib/db/schemas/vendas'
import { dbProduto, dbCliente } from '@/lib/db/schemas/cadastros'

export class VendaService {
  constructor(private db: AppDB) {}

  async list({ page, limit, dataInicio, dataFim, origem, tipoEntrega }: {
    page: number
    limit: number
    dataInicio?: string
    dataFim?: string
    origem?: string
    tipoEntrega?: string
  }) {
    const offset = (page - 1) * limit
    const conditions = [eq(dbVenda.activeFlag, true)]
    if (dataInicio) conditions.push(gte(dbVenda.vendidaEm, new Date(dataInicio)))
    if (dataFim) {
      const fim = new Date(dataFim)
      fim.setHours(23, 59, 59, 999)
      conditions.push(lte(dbVenda.vendidaEm, fim))
    }
    if (origem)      conditions.push(eq(dbVenda.origem, origem))
    if (tipoEntrega) conditions.push(eq(dbVenda.tipoEntrega, tipoEntrega))
    const whereClause = and(...conditions)

    const [vendas, totals] = await Promise.all([
      this.db.select().from(dbVenda).where(whereClause)
        .orderBy(desc(dbVenda.vendidaEm)).limit(limit).offset(offset),
      this.db.select({ total: count() }).from(dbVenda).where(whereClause),
    ])

    const total = Number(totals[0]?.total ?? 0)
    return { data: vendas, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } }
  }

  async findById(id: number) {
    const [venda] = await this.db.select().from(dbVenda).where(eq(dbVenda.vendaId, id))
    if (!venda) return null
    const [itens, pagamentos] = await Promise.all([
      this.db.select().from(dbVendaItem).where(eq(dbVendaItem.vendaId, id)),
      this.db.select().from(dbVendaPagamento).where(eq(dbVendaPagamento.vendaId, id)),
    ])

    let cliente = null
    if (venda.clienteId) {
      const [c] = await this.db.select().from(dbCliente).where(eq(dbCliente.clienteId, venda.clienteId))
      cliente = c ?? null
    }

    return { ...venda, itens, pagamentos, cliente }
  }

  async kpis() {
    const now    = new Date()
    const hoje   = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const semana = new Date(hoje)
    semana.setDate(semana.getDate() - semana.getDay())
    const mes = new Date(now.getFullYear(), now.getMonth(), 1)
    const base = eq(dbVenda.activeFlag, true)

    const [hojeData, semanaData, mesData, entregasHoje] = await Promise.all([
      this.db.select({
        total: sql<number>`COALESCE(SUM(total), 0)`,
        qtd:   count(),
      }).from(dbVenda).where(and(base, gte(dbVenda.vendidaEm, hoje))),

      this.db.select({
        total: sql<number>`COALESCE(SUM(total), 0)`,
      }).from(dbVenda).where(and(base, gte(dbVenda.vendidaEm, semana))),

      this.db.select({
        total: sql<number>`COALESCE(SUM(total), 0)`,
        qtd:   count(),
      }).from(dbVenda).where(and(base, gte(dbVenda.vendidaEm, mes))),

      this.db.select({ qtd: count() }).from(dbVenda).where(and(
        base,
        eq(dbVenda.tipoEntrega, 'entrega'),
        gte(dbVenda.dataEntrega, hoje),
        lte(dbVenda.dataEntrega, new Date(hoje.getTime() + 86400000)),
      )),
    ])

    return {
      hoje:         { total: Number(hojeData[0]?.total ?? 0),  qtd: Number(hojeData[0]?.qtd ?? 0) },
      semana:       { total: Number(semanaData[0]?.total ?? 0) },
      mes:          { total: Number(mesData[0]?.total ?? 0),   qtd: Number(mesData[0]?.qtd ?? 0) },
      entregasHoje: { qtd: Number(entregasHoje[0]?.qtd ?? 0) },
    }
  }

  async criarDireta({ itens, clienteId, desconto, pagamentos, tipoEntrega, dataEntrega, enderecoEntrega, observacao, observacaoInterna, vendedor, userId }: {
    itens:              { produtoId: number; quantidade: number }[]
    clienteId?:         number
    desconto:           number
    pagamentos:         { forma: string; valor: number }[]
    tipoEntrega:        'retirada' | 'entrega'
    dataEntrega?:       string
    enderecoEntrega?:   string
    observacao?:        string
    observacaoInterna?: string
    vendedor?:          string
    userId:             number
  }) {
    const now = new Date()
    let subtotal = 0
    const itemsDetalhados: any[] = []

    for (const item of itens) {
      const [produto] = await this.db.select().from(dbProduto).where(eq(dbProduto.produtoId, item.produtoId))
      if (!produto) throw new Error(`Produto ${item.produtoId} não encontrado`)
      const precoUnitario = produto.precoVarejo
      const itemSubtotal  = precoUnitario * item.quantidade
      subtotal += itemSubtotal
      itemsDetalhados.push({ ...item, nomeProduto: produto.nome, precoUnitario, subtotal: itemSubtotal })
    }

    const total = Math.max(0, subtotal - desconto)

    const [venda] = await this.db.insert(dbVenda).values({
      origem:            'direta',
      clienteId,
      status:            'concluida',
      tipoEntrega,
      dataEntrega:       dataEntrega ? new Date(dataEntrega) : null,
      enderecoEntrega:   enderecoEntrega || null,
      subtotal,
      desconto,
      total,
      observacao:        observacao || null,
      observacaoInterna: observacaoInterna || null,
      vendedor:          vendedor || null,
      vendidaEm:         now,
      createdBy:         userId,
      updatedBy:         userId,
      createdDt:         now,
      updatedDt:         now,
    }).returning({ vendaId: dbVenda.vendaId })

    for (const item of itemsDetalhados) {
      await this.db.insert(dbVendaItem).values({
        vendaId:       venda.vendaId,
        produtoId:     item.produtoId,
        nomeProduto:   item.nomeProduto,
        quantidade:    item.quantidade,
        precoUnitario: item.precoUnitario,
        subtotal:      item.subtotal,
        createdBy:     userId,
        updatedBy:     userId,
        createdDt:     now,
        updatedDt:     now,
      })
    }

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

    for (const item of itemsDetalhados) {
      await this.db.update(dbProduto).set({
        estoqueAtual: sql`${dbProduto.estoqueAtual} - ${item.quantidade}`,
        updatedDt:    now,
        updatedBy:    userId,
      }).where(eq(dbProduto.produtoId, item.produtoId))
    }

    return { vendaId: venda.vendaId }
  }
}