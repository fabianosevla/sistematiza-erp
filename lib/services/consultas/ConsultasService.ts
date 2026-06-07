import { and, eq, gte, lte, desc, inArray, sql } from 'drizzle-orm'
import type { AppDB } from '@/lib/db/connection'
import { dbVenda, dbVendaItem, dbVendaPagamento } from '@/lib/db/schemas/vendas'
import { dbCliente, dbProduto, dbInsumo } from '@/lib/db/schemas/cadastros'
import { dbProducaoSemanal } from '@/lib/db/schemas/producao'

export class ConsultasService {
  constructor(private db: AppDB) {}

  async listVendas({ dataInicio, dataFim, page = 1, limit = 20 }: { dataInicio?: string; dataFim?: string; page?: number; limit?: number }) {
    const conditions = [eq(dbVenda.activeFlag, true)]
    if (dataInicio) conditions.push(gte(dbVenda.vendidaEm, new Date(dataInicio)))
    if (dataFim) { const fim = new Date(dataFim); fim.setHours(23,59,59,999); conditions.push(lte(dbVenda.vendidaEm, fim)) }

    const offset = (page - 1) * limit
    const [vendas, clientes] = await Promise.all([
      this.db.select().from(dbVenda).where(and(...conditions))
        .orderBy(desc(dbVenda.vendidaEm)).limit(limit).offset(offset),
      this.db.select({ clienteId: dbCliente.clienteId, nome: dbCliente.nomeCompleto }).from(dbCliente),
    ])

    if (vendas.length === 0) return { data: [], meta: { total: 0, page, limit, totalPages: 0 } }

    const vendaIds = vendas.map(v => v.vendaId)
    const [itens, pagamentos] = await Promise.all([
      this.db.select().from(dbVendaItem).where(inArray(dbVendaItem.vendaId, vendaIds)),
      this.db.select().from(dbVendaPagamento).where(inArray(dbVendaPagamento.vendaId, vendaIds)),
    ])

    const clienteMap = Object.fromEntries(clientes.map(c => [c.clienteId, c.nome]))
    const data = vendas.map(v => ({
      ...v,
      clienteNome: v.clienteId ? clienteMap[v.clienteId] ?? '—' : 'Consumidor Final',
      itens:       itens.filter(i => i.vendaId === v.vendaId),
      pagamentos:  pagamentos.filter(p => p.vendaId === v.vendaId),
    }))

    const [countResult] = await this.db.select({ total: sql<number>`COUNT(*)` }).from(dbVenda).where(and(...conditions))
    const total = Number(countResult?.total ?? 0)
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } }
  }

  async listVendasPorProduto({ dataInicio, dataFim }: { dataInicio?: string; dataFim?: string }) {
    const result = await this.db.execute(sql`
      SELECT vi.produto_id, vi.nome_produto,
             SUM(vi.quantidade)::int as total_qtd,
             SUM(vi.subtotal)::bigint as total_valor,
             COUNT(DISTINCT vi.venda_id)::int as total_vendas,
             MAX(v.vendida_em) as ultima_venda
      FROM t_venda_item vi
      JOIN t_venda v ON vi.venda_id = v.venda_id
      WHERE v.active_flg = true
        ${dataInicio ? sql`AND v.vendida_em >= ${new Date(dataInicio)}` : sql``}
        ${dataFim    ? sql`AND v.vendida_em <= ${new Date(dataFim)}` : sql``}
      GROUP BY vi.produto_id, vi.nome_produto
      ORDER BY total_qtd DESC
    `)
    return (result.rows as any[]).map(r => ({
      produtoId:   r.produto_id,
      nome:        r.nome_produto,
      totalQtd:    Number(r.total_qtd),
      totalValor:  Number(r.total_valor),
      totalVendas: Number(r.total_vendas),
      ultimaVenda: r.ultima_venda,
    }))
  }

  async listInsumos() {
    return this.db.select({
      insumoId:     dbInsumo.insumoId,
      nome:         dbInsumo.nome,
      estoqueAtual: dbInsumo.estoqueAtual,
      estoqueMinimo: dbInsumo.estoqueMinimo,
      unidade:      dbInsumo.unidade,
      tipo:         dbInsumo.tipo,
      precoCusto:   dbInsumo.precoCusto,
    }).from(dbInsumo).where(eq(dbInsumo.activeFlag, true)).orderBy(dbInsumo.nome)
  }

  async listProdutos() {
    const agora = new Date()
    const inicioSemana = new Date(agora)
    inicioSemana.setDate(agora.getDate() - agora.getDay() + 1)
    const fimSemana = new Date(inicioSemana)
    fimSemana.setDate(inicioSemana.getDate() + 5)

    const [produtos, producoes] = await Promise.all([
      this.db.select({
        produtoId:     dbProduto.produtoId,
        nome:          dbProduto.nome,
        estoqueAtual:  dbProduto.estoqueAtual,
estoqueMinimo: dbProduto.estoqueMinimo,
        unidade:       dbProduto.unidade,
        activeFlag:    dbProduto.activeFlag,
      }).from(dbProduto).where(eq(dbProduto.activeFlag, true)).orderBy(dbProduto.nome),
      this.db.select().from(dbProducaoSemanal).where(and(
        eq(dbProducaoSemanal.activeFlag, true),
        gte(dbProducaoSemanal.dataProducao, inicioSemana.toISOString().slice(0,10)),
        lte(dbProducaoSemanal.dataProducao, fimSemana.toISOString().slice(0,10)),
      )),
    ])

    const gradeMap: Record<number, Record<string, number>> = {}
    for (const p of producoes) {
      if (!gradeMap[p.produtoId]) gradeMap[p.produtoId] = {}
      gradeMap[p.produtoId][p.dataProducao] = p.quantidade
    }

    return produtos.map(p => ({ ...p, producaoSemana: gradeMap[p.produtoId] ?? {} }))
  }
}