// lib/services/crm/Cliente360Service.ts
//
// Ficha 360° do cliente — agrega o que já existe em t_cliente, t_venda,
// t_pedido e t_fidelidade_movimento numa visão só. Não cria dado novo, só
// lê e junta. SQL cru (mesmo padrão de FiscalService/ConsultasService):
// mais simples que compor join tipado entre schemas que nem todos estão
// registrados em allSchemas (fidelidade não está).
import { sql } from 'drizzle-orm'
import type { AppDB } from '@/lib/db/connection'

export class Cliente360Service {
  constructor(private db: AppDB) {}

  async buscar(termo: string, limite = 20) {
    const r = await this.db.execute(sql`
      SELECT cliente_id, nome_completo, nome_fantasia, tipo_pessoa, documento,
             telefone, celular, cidade, uf
        FROM t_cliente
       WHERE active_flg = true
         AND (nome_completo ILIKE ${'%' + termo + '%'} OR nome_fantasia ILIKE ${'%' + termo + '%'} OR documento ILIKE ${'%' + termo + '%'})
       ORDER BY nome_completo ASC
       LIMIT ${limite}
    `)
    return (r.rows as any[]).map(c => ({
      clienteId: c.cliente_id, nome: c.nome_completo, nomeFantasia: c.nome_fantasia,
      tipoPessoa: c.tipo_pessoa, documento: c.documento,
      telefone: c.telefone ?? c.celular, cidade: c.cidade, uf: c.uf,
    }))
  }

  /**
   * Lista paginada de clientes com resumo de compra — pra tabela padrão
   * (DataTable com paginação/filtro) na Visão Geral do CRM. Mesma ideia da
   * Ficha 360°, só que uma linha resumida por cliente em vez do detalhe
   * completo.
   */
  async listarComResumo({ page, limit, search }: { page: number; limit: number; search?: string }) {
    const offset = (page - 1) * limit
    const filtro = search?.trim() ? sql`AND (c.nome_completo ILIKE ${'%' + search.trim() + '%'} OR c.nome_fantasia ILIKE ${'%' + search.trim() + '%'})` : sql``

    const [dataRes, totalRes] = await Promise.all([
      this.db.execute(sql`
        SELECT c.cliente_id, c.nome_completo, c.nome_fantasia, c.tipo_pessoa, c.telefone, c.celular,
               COUNT(v.venda_id)::int AS qtd_compras,
               COALESCE(SUM(v.total), 0)::bigint AS total_gasto,
               MAX(v.vendida_em) AS ultima_compra
          FROM t_cliente c
          LEFT JOIN t_venda v ON v.cliente_id = c.cliente_id AND v.active_flg = true
         WHERE c.active_flg = true ${filtro}
         GROUP BY c.cliente_id
         ORDER BY ultima_compra DESC NULLS LAST
         LIMIT ${limit} OFFSET ${offset}
      `),
      this.db.execute(sql`
        SELECT COUNT(*)::int AS total FROM t_cliente c WHERE c.active_flg = true ${filtro}
      `),
    ])

    const total = (totalRes.rows as any[])[0]?.total ?? 0
    return {
      data: (dataRes.rows as any[]).map(c => ({
        clienteId: c.cliente_id, nome: c.nome_completo, nomeFantasia: c.nome_fantasia,
        tipoPessoa: c.tipo_pessoa, telefone: c.telefone ?? c.celular,
        qtdCompras: c.qtd_compras, totalGasto: Number(c.total_gasto), ultimaCompra: c.ultima_compra,
      })),
      meta: { total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) },
    }
  }

  async ficha(clienteId: number) {
    const [clienteRes, resumoRes, vendasRes, pedidosRes, fidelidadeRes, indicacoesRes] = await Promise.all([
      this.db.execute(sql`
        SELECT c.*, i.nome_completo AS indicado_por_nome
          FROM t_cliente c
          LEFT JOIN t_cliente i ON i.cliente_id = c.indicado_por_cliente_id
         WHERE c.cliente_id = ${clienteId} AND c.active_flg = true
      `),
      this.db.execute(sql`
        SELECT COUNT(*)::int AS qtd_compras,
               COALESCE(SUM(total), 0)::bigint AS total_gasto,
               COALESCE(AVG(total), 0)::bigint AS ticket_medio,
               MAX(vendida_em) AS ultima_compra,
               MIN(vendida_em) AS primeira_compra
          FROM t_venda
         WHERE cliente_id = ${clienteId} AND active_flg = true
      `),
      this.db.execute(sql`
        SELECT venda_id, total, vendida_em, status, origem
          FROM t_venda
         WHERE cliente_id = ${clienteId} AND active_flg = true
         ORDER BY vendida_em DESC
         LIMIT 20
      `),
      this.db.execute(sql`
        SELECT pedido_id, status, data_pedido, previsao_entrega, valor_entrega
          FROM t_pedido
         WHERE cliente_id = ${clienteId} AND active_flg = true
         ORDER BY data_pedido DESC
         LIMIT 20
      `),
      // Fidelidade não está em allSchemas (tabela fora do Drizzle tipado —
      // mesmo motivo do CashbackService), mas a leitura é livre via SQL cru.
      this.db.execute(sql`
        SELECT
          COALESCE(SUM(valor_centavos) FILTER (WHERE tipo IN ('credito', 'ajuste')), 0)::bigint
            - COALESCE(SUM(valor_centavos) FILTER (WHERE tipo IN ('uso', 'estorno_credito', 'expiracao')), 0)::bigint AS saldo,
          COUNT(*) FILTER (WHERE tipo = 'credito')::int AS qtd_creditos
        FROM t_fidelidade_movimento
        WHERE cliente_id = ${clienteId} AND active_flg = true
      `).catch(() => ({ rows: [{ saldo: 0, qtd_creditos: 0 }] })),
      // Quem esse cliente indicou.
      this.db.execute(sql`
        SELECT cliente_id, nome_completo, created_dt
          FROM t_cliente
         WHERE indicado_por_cliente_id = ${clienteId} AND active_flg = true
         ORDER BY created_dt DESC
      `),
    ])

    const cliente = (clienteRes.rows as any[])[0]
    if (!cliente) return null
    const resumo = (resumoRes.rows as any[])[0]
    const fidelidade = (fidelidadeRes.rows as any[])[0] ?? { saldo: 0, qtd_creditos: 0 }

    return {
      cliente: {
        clienteId: cliente.cliente_id, nome: cliente.nome_completo, nomeFantasia: cliente.nome_fantasia,
        tipoPessoa: cliente.tipo_pessoa, documento: cliente.documento,
        email: cliente.email, telefone: cliente.telefone, celular: cliente.celular,
        endereco: cliente.endereco, cidade: cliente.cidade, uf: cliente.uf,
        tabelaPreco: cliente.tabela_preco, observacao: cliente.observacao,
        indicadoPorNome: cliente.indicado_por_nome,
      },
      resumo: {
        qtdCompras:     resumo?.qtd_compras ?? 0,
        totalGasto:     Number(resumo?.total_gasto ?? 0),
        ticketMedio:    Number(resumo?.ticket_medio ?? 0),
        ultimaCompra:   resumo?.ultima_compra ?? null,
        primeiraCompra: resumo?.primeira_compra ?? null,
        saldoCashback:  Number(fidelidade.saldo ?? 0),
      },
      vendas: (vendasRes.rows as any[]).map(v => ({
        vendaId: v.venda_id, total: v.total, vendidaEm: v.vendida_em, status: v.status, origem: v.origem,
      })),
      pedidos: (pedidosRes.rows as any[]).map(p => ({
        pedidoId: p.pedido_id, status: p.status, dataPedido: p.data_pedido,
        previsaoEntrega: p.previsao_entrega, valorEntrega: p.valor_entrega,
      })),
      indicacoes: (indicacoesRes.rows as any[]).map(i => ({
        clienteId: i.cliente_id, nome: i.nome_completo, desde: i.created_dt,
      })),
    }
  }
}
