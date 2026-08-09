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
        COALESCE(v.documento_fiscal, 'nenhum') AS documento_fiscal,
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
        ), 0)::numeric AS qtd_itens,
        -- Lista dos produtos da venda, para a tela poder filtrar por produto
        -- sem uma segunda consulta. Vem como array para o filtro comparar
        -- item a item — com texto concatenado, filtrar por "Lasanha" pegaria
        -- também "Lasanha Vegetariana" e vice-versa.
        COALESCE((
          SELECT ARRAY_AGG(DISTINCT vi.nome_produto)
          FROM t_venda_item vi
          WHERE vi.venda_id = v.venda_id
        ), ARRAY[]::varchar[]) AS produtos
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
        // Faturado x não faturado. Filtrável na tabela, e é a separacao que
        // permite comparar o gerencial com o que foi declarado.
        nota:        r.documento_fiscal === 'nenhum' ? 'Sem nota' : 'Com nota',
        formas:      r.formas ?? '—',
        produtos:    Array.isArray(r.produtos) ? r.produtos.filter(Boolean) : [],
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
  // TUDO QUE FAZ ESTOQUE SUBIR, venha de onde vier.
  //
  // Cada pessoa registra do seu jeito, e hoje há três caminhos que entram
  // aqui:
  //   • Registrar Produção          → grava tipo 'entrada'
  //   • Estoque → Movimentar        → grava 'entrada' ou 'ajuste'
  //   • Estoque → Ajustar           → grava 'entrada' com a diferença
  //
  // Por isso o filtro aceita 'entrada' E 'ajuste' com quantidade positiva.
  // Filtrar só por 'entrada' escondia todo aumento lançado como ajuste — e o
  // relatório dizia que nada entrou num dia em que entrou.
  //
  // O nome vem de t_produto ou t_insumo conforme a coluna `entidade`: a
  // movimentação guarda só o id, e sem esse join a consulta mostraria
  // "entidade 14" para o operador.
  async entradasEstoquePorPeriodo(
    { dataInicio, dataFim, entidade }:
    { dataInicio?: string; dataFim?: string; entidade?: 'produto' | 'insumo' },
  ) {
    const { inicio, fim } = this.limites(dataInicio, dataFim)

    const res = await this.db.execute(sql`
      SELECT
        m.movimentacao_id,
        m.data_movimentacao,
        m.tipo,
        m.entidade,
        m.entidade_id,
        m.quantidade,
        -- Custo da movimentação, com o do cadastro como reserva.
        --
        -- Produção e ajuste manual gravam preco_custo = 0: ali não houve
        -- compra, então não há preço pago. A coluna aparecia vazia e o
        -- relatório parecia quebrado. Agora cai no custo do cadastro e a
        -- linha é marcada como estimada, para ninguém somar isso achando que
        -- é dinheiro que saiu.
        m.preco_custo,
        COALESCE(NULLIF(m.preco_custo, 0), p.preco_custo, i.preco_custo, 0) AS custo_efetivo,
        -- Produto de revenda e insumo são COMPRADOS: o custo deles é preço
        -- pago. Produto fabricado não tem preço de compra — o custo dele é
        -- calculado pela ficha técnica, e por isso vive em outra coluna.
        COALESCE(p.revenda, true) AS eh_comprado,
        m.observacao,
        COALESCE(p.nome,    i.nome)    AS nome,
        COALESCE(p.unidade, i.unidade) AS unidade
      FROM t_movimentacao_estoque m
      LEFT JOIN t_produto p ON m.entidade = 'produto' AND p.produto_id = m.entidade_id
      LEFT JOIN t_insumo  i ON m.entidade = 'insumo'  AND i.insumo_id  = m.entidade_id
      WHERE m.active_flg = true
        AND (m.tipo = 'entrada' OR (m.tipo = 'ajuste' AND m.quantidade > 0))
        ${entidade ? sql`AND m.entidade = ${entidade}` : sql``}
        AND m.data_movimentacao >= ${inicio}
        AND m.data_movimentacao <= ${fim}
      ORDER BY m.data_movimentacao DESC, m.movimentacao_id DESC
    `)

    const itens = (res.rows as any[]).map(r => {
      // quantidade é NUMERIC(12,3) — o driver devolve string. Sem o Number
      // aqui, a soma dos KPIs viraria concatenação de texto.
      const qtd       = Number(r.quantidade ?? 0)
      const custoReal = Number(r.preco_custo ?? 0)
      const custo     = Number(r.custo_efetivo ?? 0)
      // Comprado (insumo ou produto de revenda) → o valor é PREÇO PAGO.
      // Fabricado → não existe preço de compra; o valor é ESTIMATIVA vinda do
      // cadastro/ficha. São naturezas diferentes e por isso ocupam colunas
      // diferentes na tela: somar as duas na mesma coluna misturaria dinheiro
      // que saiu com dinheiro que se supõe.
      const comprado = r.eh_comprado === true
      return {
        movimentacaoId: Number(r.movimentacao_id),
        data:      r.data_movimentacao,
        comprado,
        custoUnitario: comprado ? custo : 0,
        custoEstimadoUnit: comprado ? 0 : custo,
        custoEstimado: !comprado,
        // 'entrada' ou 'ajuste' — a tela mostra, para o operador saber se
        // aquele aumento veio de produção/compra ou de correção manual.
        tipoMov:   r.tipo,
        entidade:  r.entidade,
        nome:      r.nome ?? `${r.entidade} #${r.entidade_id}`,
        unidade:   r.unidade ?? '',
        quantidade: qtd,
        precoCusto: custo,
        valorTotal: Math.round(qtd * custo),
        valorPago:      comprado ? Math.round(qtd * custo) : 0,
        valorEstimado: !comprado ? Math.round(qtd * custo) : 0,
        observacao: r.observacao ?? '',
      }
    })

    return {
      itens,
      kpis: {
        quantidade:    itens.length,
        totalProdutos: itens.filter(i => i.entidade === 'produto').length,
        totalInsumos:  itens.filter(i => i.entidade === 'insumo').length,
        valorTotal:    itens.reduce((a, i) => a + i.valorTotal, 0),
        valorPago:     itens.reduce((a, i) => a + i.valorPago, 0),
        valorEstimado: itens.reduce((a, i) => a + i.valorEstimado, 0),
        estimados:     itens.filter(i => i.custoEstimado).length,
      },
    }
  }

  // ── GASTOS DE DESPESAS ────────────────────────────────────────────────────
  //
  // Despesas lançadas em Financeiro. O recorte é por `data_despesa`, e não
  // por mês de competência: quem consulta "3 a 5 de agosto" quer o que foi
  // gasto naqueles dias, não o que pertence à competência de agosto.
  async despesasPorPeriodo(
    { dataInicio, dataFim, incluirFixos = true }:
    { dataInicio?: string; dataFim?: string; incluirFixos?: boolean },
  ) {
    const { inicio, fim } = this.limites(dataInicio, dataFim)

    // t_compra só existe depois de scripts/migrate-compra-rapida-v2.js. Sem
    // esta checagem, um tenant que ainda não migrou receberia "relation
    // t_compra does not exist" e a aba inteira morreria — trocar um relatório
    // que funciona por um erro, só para exibir uma coluna a mais, é péssimo
    // negócio.
    const chk = await this.db.execute(sql`SELECT to_regclass('t_compra') IS NOT NULL AS existe`)
    const temCompra = (chk.rows[0] as any)?.existe === true

    const res = temCompra
      ? await this.db.execute(sql`
          SELECT d.despesa_id, d.data_despesa, d.nome, d.categoria, d.valor,
                 d.recorrente, d.gerada_automaticamente, d.observacao,
                 c.compra_id
          FROM t_despesa d
          LEFT JOIN t_compra c ON c.despesa_id = d.despesa_id AND c.active_flg = true
          WHERE d.active_flg = true
            AND d.data_despesa >= ${inicio}
            AND d.data_despesa <= ${fim}
          ORDER BY d.data_despesa DESC, d.despesa_id DESC
        `)
      : await this.db.execute(sql`
          SELECT d.despesa_id, d.data_despesa, d.nome, d.categoria, d.valor,
                 d.recorrente, d.gerada_automaticamente, d.observacao,
                 NULL::int AS compra_id
          FROM t_despesa d
          WHERE d.active_flg = true
            AND d.data_despesa >= ${inicio}
            AND d.data_despesa <= ${fim}
          ORDER BY d.data_despesa DESC, d.despesa_id DESC
        `)

    const avulsas = (res.rows as any[]).map(r => ({
      despesaId:  Number(r.despesa_id),
      data:       r.data_despesa,
      nome:       r.nome,
      categoria:  r.categoria ?? '—',
      valor:      Number(r.valor ?? 0),
      recorrente: r.recorrente === true,
      compraId:   r.compra_id ? Number(r.compra_id) : null,
      origem:     r.compra_id ? 'Compra'
                : r.gerada_automaticamente === true ? 'Recorrente'
                : 'Manual',
      observacao: r.observacao ?? '',
    }))

    // ── GASTOS FIXOS ────────────────────────────────────────────────────────
    //
    // Aluguel, luz, salário. Moram em t_gasto_fixo_valor, que é uma GRADE
    // (categoria × ano × mês) e não tem data — por isso ficavam de fora deste
    // relatório enquanto o DRE já os contava. "Quanto gastei em agosto" tinha
    // resposta diferente conforme a tela.
    //
    // Convenção adotada: o gasto fixo do mês conta como lançado no DIA 1º.
    // Então ele entra quando o período consultado contém o dia 1º daquele mês.
    // Consultar agosto inteiro traz o aluguel; consultar 3 a 5 de agosto não
    // traz — e é proposital, senão três dias apareceriam com o aluguel cheio.
    const fixosRes = !incluirFixos ? { rows: [] as any[] } : await this.db.execute(sql`
      SELECT gv.valor_id, gv.ano, gv.mes, gv.valor, gc.nome AS categoria
      FROM t_gasto_fixo_valor gv
      JOIN t_gasto_fixo_categoria gc
        ON gc.categoria_id = gv.categoria_id AND gc.active_flg = true
      WHERE gv.active_flg = true
        AND gv.valor > 0
        AND MAKE_DATE(gv.ano, gv.mes, 1) >= ${inicio}::date
        AND MAKE_DATE(gv.ano, gv.mes, 1) <= ${fim}::date
      ORDER BY gv.ano DESC, gv.mes DESC, gc.ordem, gc.nome
    `).catch(() => ({ rows: [] as any[] }))

    const fixos = (fixosRes.rows as any[]).map(r => ({
      // Id negativo para não colidir com despesa_id na chave da tabela.
      despesaId:  -Number(r.valor_id),
      data:       new Date(Number(r.ano), Number(r.mes) - 1, 1).toISOString(),
      nome:       r.categoria,
      categoria:  'Gasto fixo',
      valor:      Number(r.valor ?? 0),
      recorrente: true,
      compraId:   null as number | null,
      origem:     'Fixo',
      observacao: `Gasto fixo de ${String(r.mes).padStart(2, '0')}/${r.ano}`,
    }))

    const itens = [...avulsas, ...fixos].sort(
      (a, b) => new Date(b.data).getTime() - new Date(a.data).getTime(),
    )

    const total = itens.reduce((a, i) => a + i.valor, 0)
    return {
      itens,
      kpis: {
        quantidade:  itens.length,
        valorTotal:  total,
        deCompras:   itens.filter(i => i.origem === 'Compra').length,
        fixos:       fixos.reduce((a, i) => a + i.valor, 0),
        manuais:     itens.filter(i => i.origem === 'Manual').length,
      },
    }
  }

  // ── DRE DO PERÍODO ────────────────────────────────────────────────────────
  //
  // O DRE que existia em Financeiro só sabia trabalhar por MÊS fechado. Aqui
  // ele aceita qualquer intervalo, para casar com o seletor de período das
  // Consultas — inclusive o customizado.
  //
  // Estrutura, na ordem em que se lê um demonstrativo:
  //
  //   Receita bruta
  //   (-) Taxas de meio de pagamento     dedução de receita, não despesa
  //   = Receita líquida
  //   (-) Despesas por categoria         avulsas + compras + gastos fixos
  //   = Resultado
  //
  // Taxa de cartão fica FORA das despesas de propósito: ela não é escolha de
  // gasto, é desconto na receita. Somá-la junto com aluguel distorceria a
  // comparação entre categorias.
  async drePorPeriodo({ dataInicio, dataFim }: { dataInicio?: string; dataFim?: string }) {
    const { inicio, fim } = this.limites(dataInicio, dataFim)

    const [recRes, taxaRes, despRes, fixRes] = await Promise.all([
      this.db.execute(sql`
        SELECT COALESCE(SUM(total), 0)::bigint AS receita, COUNT(*)::int AS qtd
        FROM t_venda
        WHERE active_flg = true AND vendida_em >= ${inicio} AND vendida_em <= ${fim}
      `),
      this.db.execute(sql`
        SELECT COALESCE(vp.forma, 'Não informado') AS forma,
               COALESCE(fp.taxa, 0)               AS taxa_pct,
               COALESCE(SUM(vp.valor), 0)::bigint AS valor_pago,
               COALESCE(SUM(ROUND(vp.valor * COALESCE(fp.taxa, 0) / 100.0)), 0)::bigint AS valor_taxa
        FROM t_venda_pagamento vp
        JOIN t_venda v ON v.venda_id = vp.venda_id AND v.active_flg = true
        LEFT JOIN t_forma_pagamento fp
               ON LOWER(TRIM(fp.nome)) = LOWER(TRIM(vp.forma)) AND fp.active_flg = true
        WHERE v.vendida_em >= ${inicio} AND v.vendida_em <= ${fim}
        GROUP BY vp.forma, fp.taxa
        HAVING COALESCE(SUM(vp.valor), 0) > 0
      `).catch(() => ({ rows: [] as any[] })),
      this.db.execute(sql`
        SELECT categoria, COALESCE(SUM(valor), 0)::bigint AS total
        FROM t_despesa
        WHERE active_flg = true AND data_despesa >= ${inicio} AND data_despesa <= ${fim}
        GROUP BY categoria ORDER BY categoria
      `),
      this.db.execute(sql`
        SELECT gc.nome AS categoria, COALESCE(SUM(gv.valor), 0)::bigint AS total
        FROM t_gasto_fixo_valor gv
        JOIN t_gasto_fixo_categoria gc
          ON gc.categoria_id = gv.categoria_id AND gc.active_flg = true
        WHERE gv.active_flg = true AND gv.valor > 0
          AND MAKE_DATE(gv.ano, gv.mes, 1) >= ${inicio}::date
          AND MAKE_DATE(gv.ano, gv.mes, 1) <= ${fim}::date
        GROUP BY gc.nome ORDER BY gc.nome
      `).catch(() => ({ rows: [] as any[] })),
    ])

    const receita   = Number((recRes.rows[0] as any)?.receita ?? 0)
    const qtdVendas = Number((recRes.rows[0] as any)?.qtd ?? 0)

    const taxasPorForma = (taxaRes.rows as any[]).map(r => ({
      forma:     r.forma,
      taxaPct:   Number(r.taxa_pct),
      valorPago: Number(r.valor_pago),
      valorTaxa: Number(r.valor_taxa),
    }))
    const taxas = taxasPorForma.reduce((a, f) => a + f.valorTaxa, 0)

    // Categorias: avulsas e fixas somam na mesma linha quando têm o mesmo
    // nome. O prefixo "[Fixo]" separa quando não têm.
    const porCategoria: Record<string, number> = {}
    for (const r of despRes.rows as any[]) {
      porCategoria[r.categoria ?? 'Sem categoria'] = Number(r.total)
    }
    for (const r of fixRes.rows as any[]) {
      const cat = `[Fixo] ${r.categoria}`
      porCategoria[cat] = (porCategoria[cat] ?? 0) + Number(r.total)
    }

    const totalDespesas  = Object.values(porCategoria).reduce((a, b) => a + b, 0)
    const receitaLiquida = receita - taxas
    const resultado      = receitaLiquida - totalDespesas

    return {
      receita,
      qtdVendas,
      taxas,
      taxasPorForma,
      receitaLiquida,
      porCategoria,
      totalDespesas,
      resultado,
      margem: receita > 0 ? (resultado / receita) * 100 : 0,
      ticketMedio: qtdVendas > 0 ? Math.round(receita / qtdVendas) : 0,
    }
  }

  // ── VENDAS POR PRODUTO E POR DIA ──────────────────────────────────────────
  //
  // Uma linha por produto POR DIA — não o acumulado do período. É o recorte
  // que responde "quanto de canelone eu vendo numa terça?", que é a pergunta
  // que orienta a produção da semana seguinte.
  //
  // Produto que não vendeu no dia simplesmente não aparece: preencher a grade
  // com zeros multiplicaria as linhas por produtos × dias e enterraria o que
  // importa.
  async vendasPorProdutoPorPeriodo({ dataInicio, dataFim }: { dataInicio?: string; dataFim?: string }) {
    const { inicio, fim } = this.limites(dataInicio, dataFim)

    const res = await this.db.execute(sql`
      SELECT
        DATE(v.vendida_em)                          AS dia,
        vi.produto_id,
        vi.nome_produto,
        SUM(vi.quantidade)::numeric                 AS quantidade,
        SUM(vi.subtotal)::bigint                    AS total,
        SUM(COALESCE(vi.desconto, 0))::bigint       AS desconto,
        COUNT(DISTINCT vi.venda_id)::int            AS qtd_vendas,
        MAX(p.unidade)                              AS unidade
      FROM t_venda_item vi
      JOIN t_venda v ON v.venda_id = vi.venda_id AND v.active_flg = true
      LEFT JOIN t_produto p ON p.produto_id = vi.produto_id
      WHERE v.vendida_em >= ${inicio} AND v.vendida_em <= ${fim}
      GROUP BY DATE(v.vendida_em), vi.produto_id, vi.nome_produto
      ORDER BY dia DESC, SUM(vi.subtotal) DESC
    `)

    const itens = (res.rows as any[]).map(r => {
      const qtd   = Number(r.quantidade ?? 0)
      const total = Number(r.total ?? 0)
      return {
        // Chave própria: produto e dia juntos, porque o mesmo produto aparece
        // em vários dias.
        chave:       `${r.dia}-${r.produto_id}`,
        data:        r.dia,
        produtoId:   Number(r.produto_id),
        nome:        r.nome_produto,
        unidade:     r.unidade ?? '',
        quantidade:  qtd,
        qtdVendas:   Number(r.qtd_vendas ?? 0),
        desconto:    Number(r.desconto ?? 0),
        total,
        // Preço médio praticado no dia — revela desconto sistemático que o
        // total sozinho esconde.
        precoMedio:  qtd > 0 ? Math.round(total / qtd) : 0,
      }
    })

    const totalGeral = itens.reduce((a, i) => a + i.total, 0)
    const qtdGeral   = itens.reduce((a, i) => a + i.quantidade, 0)
    const produtos   = new Set(itens.map(i => i.produtoId))

    return {
      itens,
      kpis: {
        quantidade:  itens.length,
        produtos:    produtos.size,
        totalVendido: totalGeral,
        unidades:    qtdGeral,
      },
    }
  }
}
