import { sql } from 'drizzle-orm'
import type { AppDB } from '@/lib/db/connection'

/**
 * CONSULTAS — RELATÓRIOS POR PERÍODO.
 *
 * A versão anterior tinha quatro consultas de naturezas diferentes: duas por
 * período (vendas, vendas por produto) e duas que eram simplesmente a listagem
 * de cadastro (insumos, produtos) — estas últimas já existem em Estoque e em
 * Cadastros, e aqui só duplicavam informação sem recorte de data.
 *
 * Ficaram duas, ambas com a mesma assinatura de período:
 *
 *   vendasPorPeriodo          — o que saiu
 *   entradasEstoquePorPeriodo — o que entrou
 *
 * As duas devolvem `{ itens, kpis }` no mesmo formato, para a tela tratar as
 * abas de maneira idêntica.
 *
 * Datas: a tela envia YYYY-MM-DD. O fim do período é empurrado para 23:59:59
 * aqui no service — sem isso, consultar "hoje até hoje" perderia tudo que foi
 * registrado depois da meia-noite, que é o dia inteiro.
 */
export class ConsultasService {
  constructor(private db: AppDB) {}

  private limites(dataInicio?: string, dataFim?: string) {
    const inicio = dataInicio ? new Date(`${dataInicio}T00:00:00`) : new Date('1970-01-01T00:00:00')
    const fim    = dataFim    ? new Date(`${dataFim}T23:59:59.999`) : new Date('2999-12-31T23:59:59.999')
    return { inicio, fim }
  }

  // ── VENDAS POR PERÍODO ────────────────────────────────────────────────────
  async vendasPorPeriodo({ dataInicio, dataFim }: { dataInicio?: string; dataFim?: string }) {
    const { inicio, fim } = this.limites(dataInicio, dataFim)

    const res = await this.db.execute(sql`
      SELECT
        v.venda_id,
        v.vendida_em,
        v.total,
        v.desconto,
        v.origem,
        v.cliente_id,
        v.nome_cliente_avulso,
        cl.nome_completo  AS cliente_razao,
        cl.nome_fantasia  AS cliente_fantasia,
        COALESCE((
          SELECT STRING_AGG(DISTINCT vp.forma, ' + ')
          FROM t_venda_pagamento vp
          WHERE vp.venda_id = v.venda_id
        ), '—') AS formas,
        COALESCE((
          SELECT SUM(vi.quantidade)
          FROM t_venda_item vi
          WHERE vi.venda_id = v.venda_id
        ), 0)::numeric AS qtd_itens
      FROM t_venda v
      LEFT JOIN t_cliente cl ON cl.cliente_id = v.cliente_id
      WHERE v.active_flg = true
        AND v.vendida_em >= ${inicio}
        AND v.vendida_em <= ${fim}
      ORDER BY v.vendida_em DESC, v.venda_id DESC
    `)

    const itens = (res.rows as any[]).map(r => {
      const fantasia = String(r.cliente_fantasia ?? '').trim()
      const razao    = String(r.cliente_razao ?? '').trim()
      const avulso   = String(r.nome_cliente_avulso ?? '').trim()
      return {
        vendaId:     Number(r.venda_id),
        data:        r.vendida_em,
        // Mesma ordem de preferência do resto do sistema: como a loja conhece
        // o cliente → razão social → nome digitado na hora → não identificado.
        clienteNome: r.cliente_id
          ? (fantasia || razao || `Cliente #${r.cliente_id}`)
          : (avulso || 'Consumidor Final'),
        clienteAvulso: !r.cliente_id && !!avulso,
        origem:      r.origem ?? 'pdv',
        formas:      r.formas ?? '—',
        qtdItens:    Number(r.qtd_itens ?? 0),
        desconto:    Number(r.desconto ?? 0),
        total:       Number(r.total ?? 0),
      }
    })

    const totalVendido = itens.reduce((a, i) => a + i.total, 0)
    const totalDesc    = itens.reduce((a, i) => a + i.desconto, 0)

    return {
      itens,
      kpis: {
        quantidade:  itens.length,
        totalVendido,
        totalDesconto: totalDesc,
        ticketMedio: itens.length > 0 ? Math.round(totalVendido / itens.length) : 0,
      },
    }
  }

  // ── ENTRADA DE ESTOQUE POR PERÍODO ────────────────────────────────────────
  //
  // Só movimentações de tipo 'entrada'. O nome vem de t_produto ou t_insumo
  // conforme a coluna `entidade` — a movimentação guarda apenas o id, então
  // sem esse join a consulta mostraria "entidade 14" para o operador.
  async entradasEstoquePorPeriodo({ dataInicio, dataFim }: { dataInicio?: string; dataFim?: string }) {
    const { inicio, fim } = this.limites(dataInicio, dataFim)

    const res = await this.db.execute(sql`
      SELECT
        m.movimentacao_id,
        m.data_movimentacao,
        m.entidade,
        m.entidade_id,
        m.quantidade,
        m.preco_custo,
        m.observacao,
        COALESCE(p.nome,    i.nome)    AS nome,
        COALESCE(p.unidade, i.unidade) AS unidade
      FROM t_movimentacao_estoque m
      LEFT JOIN t_produto p ON m.entidade = 'produto' AND p.produto_id = m.entidade_id
      LEFT JOIN t_insumo  i ON m.entidade = 'insumo'  AND i.insumo_id  = m.entidade_id
      WHERE m.active_flg = true
        AND m.tipo = 'entrada'
        AND m.data_movimentacao >= ${inicio}
        AND m.data_movimentacao <= ${fim}
      ORDER BY m.data_movimentacao DESC, m.movimentacao_id DESC
    `)

    const itens = (res.rows as any[]).map(r => {
      // quantidade é NUMERIC(12,3) — o driver devolve string. Sem o Number
      // aqui, a soma dos KPIs viraria concatenação de texto.
      const qtd   = Number(r.quantidade ?? 0)
      const custo = Number(r.preco_custo ?? 0)
      return {
        movimentacaoId: Number(r.movimentacao_id),
        data:      r.data_movimentacao,
        entidade:  r.entidade,
        nome:      r.nome ?? `${r.entidade} #${r.entidade_id}`,
        unidade:   r.unidade ?? '',
        quantidade: qtd,
        precoCusto: custo,
        valorTotal: Math.round(qtd * custo),
        observacao: r.observacao ?? '',
      }
    })

    return {
      itens,
      kpis: {
        quantidade:   itens.length,
        totalProdutos: itens.filter(i => i.entidade === 'produto').length,
        totalInsumos:  itens.filter(i => i.entidade === 'insumo').length,
        valorTotal:    itens.reduce((a, i) => a + i.valorTotal, 0),
      },
    }
  }
}
