import { and, eq, gte, lte, desc, count, sql } from 'drizzle-orm'
import type { AppDB } from '@/lib/db/connection'
import { pool } from '@/lib/db/connection'
import { dbVenda, dbVendaItem, dbVendaPagamento } from '@/lib/db/schemas/vendas'
import { dbProduto, dbCliente } from '@/lib/db/schemas/cadastros'
import { FiscalService } from '@/lib/services/fiscal/FiscalService'
import { ConfiguracoesService } from '@/lib/services/configuracoes/ConfiguracoesService'

function resolverPreco(produto: any, tipoPrecao: string): number {
  switch (tipoPrecao) {
    case 'atacado_a': return produto.precoAtacadoA || produto.precoAtacado || produto.precoVarejo || 0
    case 'atacado_b': return produto.precoAtacadoB || produto.precoAtacado || produto.precoVarejo || 0
    case 'atacado_c': return produto.precoAtacadoC || produto.precoAtacado || produto.precoVarejo || 0
    case 'atacado_d': return produto.precoAtacadoD || produto.precoAtacado || produto.precoVarejo || 0
    case 'atacado_e': return produto.precoAtacadoE || produto.precoAtacado || produto.precoVarejo || 0
    default:          return produto.precoVarejo || 0
  }
}

/**
 * Converte quantidade da ficha técnica para a unidade do estoque.
 * Mesma lógica do DebitoInsumoService — centralizada aqui para uso interno.
 */
function converterUnidade(qtd: number, de: string, para: string): number {
  const f = de.toLowerCase().trim()
  const e = para.toLowerCase().trim()
  if (f === e) return qtd
  if (f === 'g'  && e === 'kg') return qtd / 1000
  if (f === 'kg' && e === 'g')  return qtd * 1000
  if (f === 'ml' && e === 'l')  return qtd / 1000
  if (f === 'l'  && e === 'ml') return qtd * 1000
  if (f === 'mg' && e === 'g')  return qtd / 1000
  if (f === 'mg' && e === 'kg') return qtd / 1_000_000
  return qtd
}

export class VendaService {
  constructor(private db: AppDB, private schemaName: string = '') {}

  async list({ page, limit, dataInicio, dataFim, origem, tipoEntrega }: {
    page: number; limit: number; dataInicio?: string; dataFim?: string; origem?: string; tipoEntrega?: string
  }) {
    const offset = (page - 1) * limit
    const conditions = [eq(dbVenda.activeFlag, true)]
    if (dataInicio) conditions.push(gte(dbVenda.vendidaEm, new Date(dataInicio)))
    if (dataFim) {
      const fim = new Date(dataFim); fim.setHours(23, 59, 59, 999)
      conditions.push(lte(dbVenda.vendidaEm, fim))
    }
    if (origem)      conditions.push(eq(dbVenda.origem, origem))
    if (tipoEntrega) conditions.push(eq(dbVenda.tipoEntrega, tipoEntrega))
    const whereClause = and(...conditions)

    const [vendas, totals] = await Promise.all([
      this.db.select().from(dbVenda).where(whereClause).orderBy(desc(dbVenda.vendidaEm)).limit(limit).offset(offset),
      this.db.select({ total: count() }).from(dbVenda).where(whereClause),
    ])

    const clienteIds = [...new Set(vendas.filter(v => v.clienteId).map(v => v.clienteId!))]
    const clienteMap: Record<number, string> = {}
    if (clienteIds.length > 0) {
      const clientes = await this.db.select({ clienteId: dbCliente.clienteId, nome: dbCliente.nomeCompleto }).from(dbCliente)
      for (const c of clientes) clienteMap[c.clienteId] = c.nome
    }

    const total = Number(totals[0]?.total ?? 0)
    const data = vendas.map(v => ({
      ...v,
      clienteNome: v.clienteId ? (clienteMap[v.clienteId] ?? '—') : 'Consumidor Final',
    }))
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } }
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
    const semana = new Date(hoje); semana.setDate(semana.getDate() - semana.getDay())
    const mes    = new Date(now.getFullYear(), now.getMonth(), 1)
    const base   = eq(dbVenda.activeFlag, true)

    const [hojeData, semanaData, mesData, entregasHoje] = await Promise.all([
      this.db.select({ total: sql<number>`COALESCE(SUM(total), 0)`, qtd: count() }).from(dbVenda).where(and(base, gte(dbVenda.vendidaEm, hoje))),
      this.db.select({ total: sql<number>`COALESCE(SUM(total), 0)` }).from(dbVenda).where(and(base, gte(dbVenda.vendidaEm, semana))),
      this.db.select({ total: sql<number>`COALESCE(SUM(total), 0)`, qtd: count(), ticketMedio: sql<number>`CASE WHEN COUNT(*) > 0 THEN COALESCE(SUM(total), 0) / COUNT(*) ELSE 0 END` }).from(dbVenda).where(and(base, gte(dbVenda.vendidaEm, mes))),
      this.db.select({ qtd: count() }).from(dbVenda).where(and(base, eq(dbVenda.tipoEntrega, 'entrega'), gte(dbVenda.dataEntrega, hoje), lte(dbVenda.dataEntrega, new Date(hoje.getTime() + 86400000)))),
    ])

    return {
      receitaHoje:   Number(hojeData[0]?.total ?? 0),
      qtdHoje:       Number(hojeData[0]?.qtd ?? 0),
      receitaSemana: Number(semanaData[0]?.total ?? 0),
      receitaMes:    Number(mesData[0]?.total ?? 0),
      qtdMes:        Number(mesData[0]?.qtd ?? 0),
      ticketMedio:   Number(mesData[0]?.ticketMedio ?? 0),
      entregasHoje:  Number(entregasHoje[0]?.qtd ?? 0),
    }
  }

  /**
   * Debita os insumos da ficha técnica de cada produto vendido.
   * Usa pool direto com search_path para garantir schema correto.
   */
  private async debitarInsumosDaVenda(itens: { produtoId: number; quantidade: number }[], userId: number) {
    if (!this.schemaName) return // sem schema, pula silenciosamente

    const client = await pool.connect()
    try {
      await client.query(`SET search_path TO "${this.schemaName}", public`)
      const now = new Date()

      for (const item of itens) {
        // Busca ficha técnica do produto
        const ficha = await client.query(`
          SELECT pi.insumo_id, pi.quantidade AS qtd_por_unidade, pi.unidade AS unidade_ficha,
                 i.unidade AS unidade_estoque, i.estoque_atual
          FROM t_produto_insumo pi
          JOIN t_insumo i ON i.insumo_id = pi.insumo_id AND i.active_flg = true
          WHERE pi.produto_id = $1 AND pi.active_flg = true
        `, [item.produtoId])

        for (const fi of ficha.rows) {
          const qtdPorUnidade = Number(fi.qtd_por_unidade)
          const qtdTotal      = converterUnidade(qtdPorUnidade * item.quantidade, fi.unidade_ficha, fi.unidade_estoque)
          const estoqueAtual  = Number(fi.estoque_atual)
          const novoEstoque   = Math.max(0, parseFloat((estoqueAtual - qtdTotal).toFixed(4)))

          await client.query(`
            UPDATE t_insumo SET estoque_atual = $1, updated_dt = $2, updated_by = $3
            WHERE insumo_id = $4
          `, [novoEstoque, now, userId, fi.insumo_id])
        }
      }
    } finally {
      client.release()
    }
  }

  async criarDireta({ itens, clienteId, desconto, pagamentos, tipoEntrega, dataEntrega, enderecoEntrega, observacao, observacaoInterna, vendedor, userId }: {
    itens: { produtoId: number; quantidade: number; tipoPrecao?: string }[]
    clienteId?:         number
    desconto:           number
    pagamentos:         { forma: string; valor: number }[]
    tipoEntrega?:       string
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
      const [produto] = await this.db.select().from(dbProduto)
        .where(and(eq(dbProduto.produtoId, item.produtoId), eq(dbProduto.activeFlag, true)))
      if (!produto) throw new Error(`Produto ${item.produtoId} não encontrado ou inativo`)

      const tipoPrecao    = item.tipoPrecao ?? 'varejo'
      const precoUnitario = resolverPreco(produto, tipoPrecao)
      const itemSubtotal  = precoUnitario * item.quantidade
      subtotal += itemSubtotal

      const labelTipo: Record<string, string> = {
        varejo: 'Varejo', atacado_a: 'Atacado A', atacado_b: 'Atacado B',
        atacado_c: 'Atacado C', atacado_d: 'Atacado D', atacado_e: 'Atacado E',
      }

      itemsDetalhados.push({
        produtoId: produto.produtoId, nomeProduto: produto.nome,
        quantidade: item.quantidade, tipoPrecao,
        nomeTipoPrecao: labelTipo[tipoPrecao] ?? 'Varejo',
        precoUnitario, subtotal: itemSubtotal,
      })
    }

    const total = Math.max(0, subtotal - desconto)

    const [venda] = await this.db.insert(dbVenda).values({
      origem:            'direta',
      clienteId:         clienteId ?? null,
      status:            'concluida',
      tipoEntrega:       tipoEntrega || 'Retirada',
      dataEntrega:       dataEntrega ? new Date(dataEntrega) : null,
      enderecoEntrega:   enderecoEntrega || null,
      subtotal, desconto, total,
      observacao:        observacao || null,
      observacaoInterna: observacaoInterna || null,
      vendedor:          vendedor || null,
      vendidaEm:         now,
      createdBy: userId, updatedBy: userId, createdDt: now, updatedDt: now,
    }).returning({ vendaId: dbVenda.vendaId })

    for (const item of itemsDetalhados) {
      try {
        await this.db.execute(sql`
          INSERT INTO t_venda_item (
            venda_id, produto_id, nome_produto, quantidade,
            tipo_precao, nome_tipo_precao, preco_unitario, subtotal,
            created_by, updated_by, created_dt, updated_dt, active_flg, modification_num
          ) VALUES (
            ${venda.vendaId}, ${item.produtoId}, ${item.nomeProduto}, ${item.quantidade},
            ${item.tipoPrecao}, ${item.nomeTipoPrecao}, ${item.precoUnitario}, ${item.subtotal},
            ${userId}, ${userId}, ${now.toISOString()}, ${now.toISOString()}, true, 0
          )
        `)
      } catch {
        await this.db.insert(dbVendaItem).values({
          vendaId: venda.vendaId, produtoId: item.produtoId, nomeProduto: item.nomeProduto,
          quantidade: item.quantidade, precoUnitario: item.precoUnitario, subtotal: item.subtotal,
          createdBy: userId, updatedBy: userId, createdDt: now, updatedDt: now,
        })
      }
    }

    for (const pag of pagamentos) {
      await this.db.insert(dbVendaPagamento).values({
        vendaId: venda.vendaId, forma: pag.forma, valor: pag.valor,
        createdBy: userId, updatedBy: userId, createdDt: now, updatedDt: now,
      })
    }

    // Debita estoque do produto acabado
    for (const item of itemsDetalhados) {
      await this.db.update(dbProduto).set({
        estoqueAtual: sql`${dbProduto.estoqueAtual} - ${item.quantidade}`,
        updatedDt: now, updatedBy: userId,
      }).where(eq(dbProduto.produtoId, item.produtoId))
    }

    // Debita insumos da ficha técnica via pool direto com search_path
    try {
      await this.debitarInsumosDaVenda(
        itemsDetalhados.map(i => ({ produtoId: i.produtoId, quantidade: i.quantidade })),
        userId
      )
    } catch (_) {
      // Não bloqueia a venda se o débito de insumos falhar
    }

    // Gera rascunho fiscal se módulo ativo
    try {
      const cfg = await new ConfiguracoesService(this.db).get()
      if (cfg?.fiscalAtivo) {
        await new FiscalService(this.db).criarNota({
          tipo: 'NFC-e', valorTotal: total, vendaId: venda.vendaId,
          itens: itemsDetalhados.map(item => ({
            descricao: item.nomeProduto, quantidade: item.quantidade, precoUnitario: item.precoUnitario,
          })),
          userId,
        })
      }
    } catch (_) {}

    return { vendaId: venda.vendaId }
  }
}