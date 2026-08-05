// @ts-nocheck
// ESTE ARQUIVO VAI EM: lib/services/producao/PedidoService.ts
import { and, eq, desc, sql } from 'drizzle-orm'
import type { AppDB } from '@/lib/db/connection'
import { dbPedido, dbPedidoItem } from '@/lib/db/schemas/producao'
import { dbProduto } from '@/lib/db/schemas/cadastros'

export class PedidoService {
  constructor(private db: AppDB) {}

  /**
   * LISTAGEM COM NOME DO CLIENTE.
   *
   * Antes era um SELECT puro em t_pedido, sem JOIN. A tela usava
   * `p.clienteNome ?? 'Consumidor Final'` e, como o campo nunca vinha, TODO
   * pedido aparecia como Consumidor Final — inclusive os que tinham cliente
   * gravado. t_pedido guarda só o cliente_id; o nome tem que vir do JOIN.
   *
   * O nome exibido é o fantasia quando existe, senão a razão social — mesma
   * regra da listagem de Clientes e das buscas do PDV e de Pedidos.
   */
  /**
   * FILTRO DE PERÍODO.
   *
   * A tela sempre mandou `periodo` na query string, e tanto a rota quanto este
   * método descartavam. Resultado: trocar "Este mês" por "Este ano" não mudava
   * absolutamente nada na lista.
   *
   * Convenção adotada, para não haver dúvida na leitura:
   *   mes       → do dia 1º do mês corrente em diante
   *   trimestre → os últimos 3 meses, contando o corrente
   *   semestre  → os últimos 6 meses, contando o corrente
   *   ano       → de 1º de janeiro do ano corrente em diante
   *   tudo      → sem recorte
   *
   * O corte é por `data_pedido`, que é a data que a tela mostra na coluna.
   */
  private recorteDePeriodo(periodo?: string) {
    switch (periodo) {
      case 'mes':       return sql`AND p.data_pedido >= date_trunc('month', CURRENT_DATE)`
      case 'trimestre': return sql`AND p.data_pedido >= date_trunc('month', CURRENT_DATE) - INTERVAL '2 months'`
      case 'semestre':  return sql`AND p.data_pedido >= date_trunc('month', CURRENT_DATE) - INTERVAL '5 months'`
      case 'ano':       return sql`AND p.data_pedido >= date_trunc('year', CURRENT_DATE)`
      // 'tudo', vazio ou valor desconhecido: não recorta.
      default:          return sql``
    }
  }

  async list({ status, periodo }: { status?: string; periodo?: string } = {}) {
    const res = await this.db.execute(sql`
      SELECT
        p.pedido_id, p.cliente_id, p.nome_cliente_avulso, p.tipo_venda, p.status,
        p.data_pedido, p.previsao_producao, p.previsao_entrega,
        p.valor_entrega, p.endereco_entrega, p.observacao, p.venda_id,
        p.active_flg, p.modification_num,
        p.created_dt, p.created_by, p.updated_dt, p.updated_by,
        cl.nome_completo AS cliente_razao,
        cl.nome_fantasia AS cliente_fantasia
      FROM t_pedido p
      LEFT JOIN t_cliente cl ON cl.cliente_id = p.cliente_id
      WHERE p.active_flg = true
        ${status ? sql`AND p.status = ${status}` : sql``}
        ${this.recorteDePeriodo(periodo)}
      ORDER BY p.data_pedido DESC, p.pedido_id DESC
    `)

    return (res.rows as any[]).map(r => {
      const fantasia = String(r.cliente_fantasia ?? '').trim()
      const razao    = String(r.cliente_razao ?? '').trim()
      const avulso   = String(r.nome_cliente_avulso ?? '').trim()
      return {
        pedidoId:         r.pedido_id,
        clienteId:        r.cliente_id,
        nomeClienteAvulso: avulso || null,
        // Ordem: cliente cadastrado → nome avulso digitado → nulo, que a tela
        // mostra como "Consumidor Final".
        clienteNome:      r.cliente_id
          ? (fantasia || razao || `Cliente #${r.cliente_id}`)
          : (avulso || null),
        clienteRazao:     razao || null,
        // Marca quem não é cliente de verdade — a tela pode sinalizar.
        clienteAvulso:    !r.cliente_id && !!avulso,
        tipoVenda:        r.tipo_venda,
        status:           r.status,
        dataPedido:       r.data_pedido,
        previsaoProducao: r.previsao_producao,
        previsaoEntrega:  r.previsao_entrega,
        valorEntrega:     Number(r.valor_entrega ?? 0),
        enderecoEntrega:  r.endereco_entrega,
        observacao:       r.observacao,
        vendaId:          r.venda_id,
        activeFlag:       r.active_flg,
        modificationNum:  r.modification_num,
        createdDt:        r.created_dt,
        createdBy:        r.created_by,
        updatedDt:        r.updated_dt,
        updatedBy:        r.updated_by,
      }
    })
  }

  async findById(id: number) {
    const [pedido] = await this.db.select().from(dbPedido).where(eq(dbPedido.pedidoId, id))
    if (!pedido) return null

    const itens = await this.db.select().from(dbPedidoItem).where(and(
      eq(dbPedidoItem.pedidoId, id),
      eq(dbPedidoItem.activeFlag, true),
    ))

    // O modal de detalhe também mostra o cliente. Mesma regra da listagem.
    let clienteNome: string | null = (pedido as any).nomeClienteAvulso?.trim() || null
    let clienteRazao: string | null = null
    if (pedido.clienteId) {
      const cli = await this.db.execute(sql`
        SELECT nome_completo, nome_fantasia
        FROM t_cliente WHERE cliente_id = ${pedido.clienteId} LIMIT 1
      `)
      const c        = (cli.rows as any[])[0] ?? {}
      const fantasia = String(c.nome_fantasia ?? '').trim()
      const razao    = String(c.nome_completo ?? '').trim()
      clienteNome  = fantasia || razao || `Cliente #${pedido.clienteId}`
      clienteRazao = razao || null
    }

    return { ...pedido, itens, clienteNome, clienteRazao }
  }

  async criar({ clienteId, nomeClienteAvulso, tipoVenda, dataPedido, previsaoProducao, previsaoEntrega, valorEntrega, enderecoEntrega, observacao, itens, userId }: {
    clienteId?:         number
    nomeClienteAvulso?: string
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
      // Só guarda o nome avulso quando NÃO há cliente cadastrado. Com os dois
      // preenchidos, o cadastro manda e o texto solto viraria ruído.
      nomeClienteAvulso: clienteId ? null : (nomeClienteAvulso?.trim() || null),
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

  /**
   * EDITAR PEDIDO — atualiza os dados do cabeçalho (cliente, tipo, datas de
   * previsão de produção/entrega, endereço, observação) e SUBSTITUI os itens:
   * inativa os atuais (soft delete, preserva histórico) e regrava a nova
   * lista com subtotais recalculados. Não mexe em status nem em estoque —
   * a rota só permite editar pedidos 'pendente'/'producao', onde o estoque
   * ainda não foi movimentado.
   */
  async atualizar(id: number, { clienteId, nomeClienteAvulso, tipoVenda, dataPedido, previsaoProducao, previsaoEntrega, valorEntrega, enderecoEntrega, observacao, itens, userId }: {
    clienteId?:         number
    nomeClienteAvulso?: string
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

    await this.db.update(dbPedido).set({
      clienteId:        clienteId ?? null,
      nomeClienteAvulso: clienteId ? null : (nomeClienteAvulso?.trim() || null),
      tipoVenda,
      dataPedido:       new Date(dataPedido),
      previsaoProducao: previsaoProducao ? new Date(previsaoProducao) : null,
      previsaoEntrega:  previsaoEntrega  ? new Date(previsaoEntrega)  : null,
      valorEntrega,
      enderecoEntrega:  enderecoEntrega ?? null,
      observacao:       observacao ?? null,
      updatedDt:        now,
      updatedBy:        userId,
    }).where(eq(dbPedido.pedidoId, id))

    // Substitui os itens: inativa os atuais e regrava a nova lista
    await this.db.update(dbPedidoItem).set({ activeFlag: false, updatedDt: now, updatedBy: userId })
      .where(eq(dbPedidoItem.pedidoId, id))

    for (const item of itens) {
      const [produto] = await this.db.select().from(dbProduto).where(eq(dbProduto.produtoId, item.produtoId))
      await this.db.insert(dbPedidoItem).values({
        pedidoId:      id,
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

    return { pedidoId: id, atualizado: true }
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