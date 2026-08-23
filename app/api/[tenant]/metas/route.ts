// @ts-nocheck
import type { NextRequest } from 'next/server'
import { eq, and, sql } from 'drizzle-orm'
import { resolveTenant } from '@/lib/auth/tenant'
import { exigirModulo } from '@/lib/auth/permissoes'
import { getDbForTenant } from '@/lib/db/connection'
import { pool } from '@/lib/db/connection'
import { usuarioAtualIdDb } from '@/lib/auth/usuarioAtual'
import { dbMeta } from '@/lib/db/schemas/metas'
import { ok, serverError } from '@/lib/api/responses'

// GET desta rota muda de resultado a cada salvar (meta, meta por produto,
// evolução) — nunca pode ser servida de cache.
export const dynamic = 'force-dynamic'

type Params = { params: { tenant: string } }

/**
 * Despesa real do mês = avulsas (t_despesa) + gastos fixos (t_gasto_fixo_valor).
 * Mesma conta que o Financeiro usa no KPI e no DRE — sem os gastos fixos
 * (aluguel, luz, salário), o número aqui ficava muito abaixo do real.
 */
export async function despesaDoMes(db: any, mes: number, ano: number): Promise<number> {
  const { total } = await despesaDoMesDetalhada(db, mes, ano)
  return total
}

/**
 * Mesmo total de despesaDoMes(), mas quebrado por origem — pra tela de Metas
 * explicar o que compõe o número em vez de jogar tudo debaixo de "Despesa".
 * Insumos vem do próprio categoria='Insumos' que Compras já grava em
 * t_despesa/t_conta_pagar (compra à vista ou baixa da compra a prazo) — não é
 * estimativa, é o valor real já rotulado na origem.
 */
export async function despesaDoMesDetalhada(db: any, mes: number, ano: number): Promise<{ insumos: number; operacionais: number; gastosFixos: number; total: number }> {
  const avulsaRes = await db.execute(sql`
    SELECT COALESCE(SUM(valor) FILTER (WHERE categoria = 'Insumos'), 0)::bigint as insumos,
           COALESCE(SUM(valor) FILTER (WHERE categoria IS DISTINCT FROM 'Insumos'), 0)::bigint as operacionais
      FROM t_despesa
     WHERE active_flg=true AND mes_competencia=${mes} AND ano_competencia=${ano}
  `)
  const fixoRes = await db.execute(sql`
    SELECT COALESCE(SUM(gv.valor),0)::bigint as total
      FROM t_gasto_fixo_valor gv
      JOIN t_gasto_fixo_categoria gc ON gc.categoria_id = gv.categoria_id AND gc.active_flg = true
     WHERE gv.active_flg = true AND gv.mes = ${mes} AND gv.ano = ${ano}
  `).catch(() => ({ rows: [{ total: 0 }] }))
  const insumos      = Number(avulsaRes.rows[0]?.insumos ?? 0)
  const operacionais  = Number(avulsaRes.rows[0]?.operacionais ?? 0)
  const gastosFixos   = Number(fixoRes.rows[0]?.total ?? 0)
  return { insumos, operacionais, gastosFixos, total: insumos + operacionais + gastosFixos }
}

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { searchParams } = new URL(req.url)
    const tipo = searchParams.get('tipo')
    const now  = new Date()
    const mes  = Number(searchParams.get('mes') ?? now.getMonth() + 1)
    const ano  = Number(searchParams.get('ano') ?? now.getFullYear())

    if (tipo === 'previsao') {
      const mesesHistorico = Math.max(1, Math.min(12, Number(searchParams.get('mesesHistorico') ?? 3)))
      const client = await pool.connect()
      try {
        await client.query(`SET search_path TO "${tenant.schemaName}", public`)
        const mesesRange = []
        for (let i = 1; i <= mesesHistorico; i++) {
          let m = mes - i, a = ano
          if (m <= 0) { m += 12; a-- }
          mesesRange.push({ mes: m, ano: a })
        }
        const where = mesesRange.map(r => `(EXTRACT(MONTH FROM v.vendida_em) = ${r.mes} AND EXTRACT(YEAR FROM v.vendida_em) = ${r.ano})`).join(' OR ')
        const historicoRes = await client.query(`
          SELECT vi.produto_id, p.nome, p.preco_varejo, p.estoque_atual,
                 SUM(vi.quantidade) as total_vendido,
                 COUNT(DISTINCT EXTRACT(YEAR FROM v.vendida_em) * 100 + EXTRACT(MONTH FROM v.vendida_em)) as num_meses
          FROM t_venda_item vi
          JOIN t_venda v ON vi.venda_id = v.venda_id AND v.active_flg = true
          JOIN t_produto p ON vi.produto_id = p.produto_id AND p.active_flg = true
          WHERE (${where})
          GROUP BY vi.produto_id, p.nome, p.preco_varejo, p.estoque_atual
          ORDER BY total_vendido DESC
        `)
        const pedidosRes = await client.query(`
          SELECT pi.produto_id, SUM(pi.quantidade) as qtd_pendente
          FROM t_pedido_item pi
          JOIN t_pedido p ON pi.pedido_id = p.pedido_id
          -- pi.active_flg: editar pedido inativa os itens antigos e grava
          -- novos. Sem o filtro, pedido corrigido conta duas vezes.
          -- 'pronto' entra: pedido pronto e não entregue continua sendo
          -- demanda em aberto, igual à coluna Ped da grade.
          WHERE p.status IN ('pendente','producao','pronto') AND p.active_flg = true
            AND pi.active_flg = true
          GROUP BY pi.produto_id
        `).catch(() => ({ rows: [] }))
        const pedidosPorProduto = {}
        for (const r of pedidosRes.rows) pedidosPorProduto[r.produto_id] = Number(r.qtd_pendente)

        // Aderência: quanto foi REALMENTE produzido no mês-alvo (mes/ano),
        // pra comparar com o que esta previsão recomendou. Só faz sentido
        // pra mês já em andamento ou passado — mês futuro fica sem produção
        // registrada, e o card de aderência não aparece.
        const produzidoRes = await client.query(`
          SELECT produto_id, SUM(qtd_produzida) as qtd_produzida
          FROM t_producao_registro
          WHERE EXTRACT(MONTH FROM data_producao) = $1 AND EXTRACT(YEAR FROM data_producao) = $2
          GROUP BY produto_id
        `, [mes, ano]).catch(() => ({ rows: [] }))
        const produzidoPorProduto = {}
        for (const r of produzidoRes.rows) produzidoPorProduto[r.produto_id] = Number(r.qtd_produzida)

        // Componente com insumo_id < 0 = produto-insumo: resolve em t_produto.
        const fichaRes = await client.query(`
          SELECT pi.produto_id, pi.insumo_id, pi.quantidade as qtd_ficha,
                 COALESCE(i.nome, p.nome)                 as nome_insumo,
                 COALESCE(i.unidade, p.unidade)           as unidade,
                 COALESCE(i.estoque_atual, p.estoque_atual) as estoque_atual,
                 COALESCE(i.preco_custo, p.preco_custo)   as preco_custo
          FROM t_produto_insumo pi
          LEFT JOIN t_insumo  i ON i.insumo_id = pi.insumo_id     AND pi.insumo_id > 0 AND i.active_flg = true
          LEFT JOIN t_produto p ON (-pi.insumo_id) = p.produto_id AND pi.insumo_id < 0 AND p.active_flg = true
          WHERE pi.active_flg = true
            AND (i.insumo_id IS NOT NULL OR p.produto_id IS NOT NULL)
        `).catch(() => ({ rows: [] }))
        const fichaPorProduto = {}
        for (const r of fichaRes.rows) {
          if (!fichaPorProduto[r.produto_id]) fichaPorProduto[r.produto_id] = []
          fichaPorProduto[r.produto_id].push(r)
        }
        let totalReceitaEstimada = 0, totalCustoInsumos = 0
        const insumosAgregados = {}
        const produtos = historicoRes.rows.map(row => {
          const mediaVendas = Number(row.total_vendido) / Number(row.num_meses)
          const pendentes = pedidosPorProduto[row.produto_id] ?? 0
          const previsaoProducao = Math.ceil(mediaVendas + pendentes)
          const receitaEstimada = Math.round(previsaoProducao * Number(row.preco_varejo ?? 0))
          totalReceitaEstimada += receitaEstimada
          for (const ins of fichaPorProduto[row.produto_id] ?? []) {
            const necessario = parseFloat(ins.qtd_ficha) * previsaoProducao
            const custo = necessario * Number(ins.preco_custo ?? 0)
            if (!insumosAgregados[ins.insumo_id]) insumosAgregados[ins.insumo_id] = { nome: ins.nome_insumo, unidade: ins.unidade, estoqueAtual: Number(ins.estoque_atual), necessario: 0, custoEstimado: 0 }
            insumosAgregados[ins.insumo_id].necessario += necessario
            insumosAgregados[ins.insumo_id].custoEstimado += custo
            totalCustoInsumos += custo
          }
          const produzidoReal = produzidoPorProduto[row.produto_id] ?? null
          const aderenciaPct  = produzidoReal !== null && previsaoProducao > 0
            ? Math.round((produzidoReal / previsaoProducao) * 1000) / 10
            : null
          return { produtoId: row.produto_id, nome: row.nome, mediaVendas: Math.round(mediaVendas * 10) / 10, pedidosPendentes: pendentes, previsaoProducao, receitaEstimada, produzidoReal, aderenciaPct }
        })
        const insumos = Object.values(insumosAgregados).sort((a, b) => b.necessario - a.necessario).map(i => ({ ...i, necessario: Math.round(i.necessario * 1000) / 1000, custoEstimado: Math.round(i.custoEstimado) }))
        return ok({ produtos, insumos, totalReceitaEstimada, totalCustoInsumos: Math.round(totalCustoInsumos), mesesHistorico, mesAlvo: { mes, ano } })
      } finally { client.release() }
    }

    // Só o ?tipo=previsao fica aberto (o card de Produção usa esse caminho
    // sem ter o módulo Metas). O restante devolve receita/despesa/lucro
    // reais do mês — dado financeiro, exige o módulo.
    await exigirModulo(tenant.schemaName, 'metas')

    if (tipo === 'evolucao') {
      const mesesHistorico = Math.max(3, Math.min(12, Number(searchParams.get('meses') ?? 6)))
      const mesesProjecao  = Math.max(0, Math.min(6, Number(searchParams.get('projetar') ?? 3)))
      const { db, release } = await getDbForTenant(tenant.schemaName)
      try {
        // Mais antigo → mais recente, terminando no mês/ano de referência.
        const mesesRange = []
        for (let i = mesesHistorico - 1; i >= 0; i--) {
          let m = mes - i, a = ano
          while (m <= 0) { m += 12; a-- }
          mesesRange.push({ mes: m, ano: a })
        }

        const hoje = new Date()
        const mesRealAtual = hoje.getMonth() + 1
        const anoRealAtual = hoje.getFullYear()

        const historico = []
        for (const r of mesesRange) {
          const receitaRes = await db.execute(sql`SELECT COALESCE(SUM(total),0)::bigint as receita FROM t_venda WHERE active_flg=true AND EXTRACT(MONTH FROM vendida_em)=${r.mes} AND EXTRACT(YEAR FROM vendida_em)=${r.ano}`)
          const receita = Number(receitaRes.rows[0]?.receita ?? 0)
          const despesa = await despesaDoMes(db, r.mes, r.ano)
          // Mês em andamento: os dados de hoje ainda não fecharam o mês, então
          // ele entra no gráfico (histórico visível), mas não na regressão —
          // um mês pela metade não é comparável a um mês fechado.
          const completo = !(r.mes === mesRealAtual && r.ano === anoRealAtual)
          historico.push({ mes: r.mes, ano: r.ano, receita, despesa, lucro: receita - despesa, completo })
        }

        // Regressão linear simples (mínimos quadrados), só sobre meses FECHADOS
        // com movimento de verdade. Meses sem nenhuma venda nem despesa antes
        // do início real de operação não são "mês zero" — são "sem dado", e
        // contar como zero distorce a reta inteira. Por isso corta os meses
        // vazios do começo da janela antes de ajustar a reta.
        const primeiroComAtividade = historico.findIndex(h => h.completo && (h.receita > 0 || h.despesa > 0))
        const pontosRegressao = primeiroComAtividade === -1
          ? []
          : historico.filter((h, i) => i >= primeiroComAtividade && h.completo)

        function regressao(pontos: number[]): { a: number; b: number } {
          const n = pontos.length
          if (n < 2) return { a: pontos[0] ?? 0, b: 0 }
          const xs = pontos.map((_, i) => i)
          const mediaX = xs.reduce((s, x) => s + x, 0) / n
          const mediaY = pontos.reduce((s, y) => s + y, 0) / n
          let num = 0, den = 0
          for (let i = 0; i < n; i++) { num += (xs[i] - mediaX) * (pontos[i] - mediaY); den += (xs[i] - mediaX) ** 2 }
          const b = den === 0 ? 0 : num / den
          return { a: mediaY - b * mediaX, b }
        }

        // Menos de 3 meses fechados com movimento: não dá pra apontar
        // tendência com responsabilidade. Devolve sem projeção e avisa.
        const mesesUsadosRegressao = pontosRegressao.length
        let projecao = []
        if (mesesUsadosRegressao >= 3) {
          const regReceita = regressao(pontosRegressao.map(h => h.receita))
          const regDespesa = regressao(pontosRegressao.map(h => h.despesa))

          for (let i = 0; i < mesesProjecao; i++) {
            const idx = mesesUsadosRegressao + i
            let m = mes + i + 1, a = ano
            while (m > 12) { m -= 12; a++ }
            const receitaProjetada = Math.max(0, Math.round(regReceita.a + regReceita.b * idx))
            const despesaProjetada = Math.max(0, Math.round(regDespesa.a + regDespesa.b * idx))
            projecao.push({ mes: m, ano: a, receitaProjetada, despesaProjetada, lucroProjetado: receitaProjetada - despesaProjetada })
          }
        }

        return ok({ historico, projecao, mesesHistorico, mesesProjecao, mesesUsadosRegressao, dadosInsuficientes: mesesUsadosRegressao < 3 })
      } finally { release() }
    }

    if (tipo === 'metaProdutos') {
      // Raw pool + $1/$2, igual ao resto do arquivo (previsao, configuracoes)
      // — de propósito, não o sql`` do Drizzle. Testado manualmente contra o
      // banco: ANY($1) com array JS funciona liso por aqui; via sql`` o
      // Drizzle expande array em lista de parâmetros (vira ROW, não array),
      // e quebrou duas vezes em produção com esse exato bloco.
      const client = await pool.connect()
      try {
        await client.query(`SET search_path TO "${tenant.schemaName}", public`)
        const metasRes = await client.query(
          `SELECT meta_produto_id, produto_id, quantidade_meta FROM t_meta_produto
            WHERE mes = $1 AND ano = $2 AND active_flg = true`,
          [mes, ano]
        )
        if (metasRes.rows.length === 0) return ok([])
        const ids = metasRes.rows.map((r: any) => r.produto_id)
        const realizadoRes = await client.query(
          `SELECT vi.produto_id, SUM(vi.quantidade) as qtd
             FROM t_venda_item vi
             JOIN t_venda v ON vi.venda_id = v.venda_id AND v.active_flg = true
            WHERE vi.produto_id = ANY($1)
              AND EXTRACT(MONTH FROM v.vendida_em) = $2 AND EXTRACT(YEAR FROM v.vendida_em) = $3
            GROUP BY vi.produto_id`,
          [ids, mes, ano]
        )
        const realizadoPorProduto: Record<number, number> = {}
        for (const r of realizadoRes.rows) realizadoPorProduto[r.produto_id] = Number(r.qtd)
        const produtosRes = await client.query(
          `SELECT produto_id, nome FROM t_produto WHERE produto_id = ANY($1)`,
          [ids]
        )
        const nomePorProduto: Record<number, string> = {}
        for (const r of produtosRes.rows) nomePorProduto[r.produto_id] = r.nome
        const lista = metasRes.rows.map((r: any) => ({
          produtoId:      r.produto_id,
          nome:           nomePorProduto[r.produto_id] ?? '(produto removido)',
          quantidadeMeta: r.quantidade_meta,
          realizado:      realizadoPorProduto[r.produto_id] ?? 0,
        }))
        return ok(lista)
      } finally { client.release() }
    }

    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const [meta] = await db.select().from(dbMeta).where(and(eq(dbMeta.mes, mes), eq(dbMeta.ano, ano), eq(dbMeta.activeFlag, true)))
      const receitaRes = await db.execute(sql`SELECT COALESCE(SUM(total),0)::bigint as receita FROM t_venda WHERE active_flg=true AND EXTRACT(MONTH FROM vendida_em)=${mes} AND EXTRACT(YEAR FROM vendida_em)=${ano}`)
      const receita = Number(receitaRes.rows[0]?.receita ?? 0)
      const detalheDespesa = await despesaDoMesDetalhada(db, mes, ano)
      const despesa = detalheDespesa.total
      const lucro = receita - despesa
      return ok({ meta: meta ?? { metaReceita: 0, metaDespesaMaxima: 0, metaLucro: 0, mes, ano }, real: { receita, despesa, lucro, detalheDespesa }, progresso: { receita: meta?.metaReceita > 0 ? Math.min(100, (receita/meta.metaReceita)*100) : null, despesa: meta?.metaDespesaMaxima > 0 ? Math.min(100, (despesa/meta.metaDespesaMaxima)*100) : null, lucro: meta?.metaLucro > 0 ? Math.min(100, (lucro/meta.metaLucro)*100) : null } })
    } finally { release() }
  } catch (err) { return serverError(err) }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    await exigirModulo(tenant.schemaName, 'metas')
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const body = await req.json()
      if (body.tipo === 'metaProdutos') {
        const uid   = await usuarioAtualIdDb(db)
        const itens = body.itens ?? []
        for (const item of itens) {
          const produtoId      = Number(item.produtoId)
          const quantidadeMeta = Number(item.quantidadeMeta) || 0
          if (!produtoId) continue
          if (quantidadeMeta <= 0) {
            // Meta zerada = remover da lista de acompanhamento.
            await db.execute(sql`
              UPDATE t_meta_produto SET active_flg = false, updated_by = ${uid}, updated_dt = NOW()
              WHERE mes = ${body.mes} AND ano = ${body.ano} AND produto_id = ${produtoId}
            `)
            continue
          }
          await db.execute(sql`
            INSERT INTO t_meta_produto (mes, ano, produto_id, quantidade_meta, created_by, updated_by)
            VALUES (${body.mes}, ${body.ano}, ${produtoId}, ${quantidadeMeta}, ${uid}, ${uid})
            ON CONFLICT (mes, ano, produto_id)
            DO UPDATE SET quantidade_meta = ${quantidadeMeta}, active_flg = true, updated_by = ${uid}, updated_dt = NOW()
          `)
        }
        return ok({ ok: true })
      }
      if (body.tipo === 'simular') {
        const itens = body.itens ?? []
        let receitaSimulada = 0, custoInsumos = 0
        for (const item of itens) {
          const prodRes = await db.execute(sql`SELECT preco_varejo FROM t_produto WHERE produto_id=${item.produtoId} AND active_flg=true`)
          receitaSimulada += item.quantidade * Number(prodRes.rows[0]?.preco_varejo ?? 0)
          // Componente com insumo_id < 0 = produto-insumo: custo vem de t_produto.
          const fichaRes = await db.execute(sql`
            SELECT pi.quantidade, COALESCE(i.preco_custo, p.preco_custo) AS preco_custo
            FROM t_produto_insumo pi
            LEFT JOIN t_insumo  i ON pi.insumo_id = i.insumo_id     AND pi.insumo_id > 0 AND i.active_flg = true
            LEFT JOIN t_produto p ON (-pi.insumo_id) = p.produto_id AND pi.insumo_id < 0 AND p.active_flg = true
            WHERE pi.produto_id=${item.produtoId} AND pi.active_flg=true
              AND (i.insumo_id IS NOT NULL OR p.produto_id IS NOT NULL)
          `)
          for (const fi of fichaRes.rows) custoInsumos += parseFloat(fi.quantidade) * item.quantidade * Number(fi.preco_custo ?? 0)
        }
        const mesSim = body.mes ?? new Date().getMonth() + 1
        const anoSim = body.ano ?? new Date().getFullYear()
        // Receita JÁ realizada no mês (mesma conta da aba Metas). Sem somar
        // isto, "Resultado Projetado" comparava só a venda hipotética contra
        // as despesas do mês inteiro — um "prejuízo" que não existe.
        const receitaRealRes = await db.execute(sql`SELECT COALESCE(SUM(total),0)::bigint as receita FROM t_venda WHERE active_flg=true AND EXTRACT(MONTH FROM vendida_em)=${mesSim} AND EXTRACT(YEAR FROM vendida_em)=${anoSim}`)
        const receitaJaRealizada = Number(receitaRealRes.rows[0]?.receita ?? 0)
        const receitaTotalProjetada = receitaJaRealizada + receitaSimulada
        const totalDespesas = await despesaDoMes(db, mesSim, anoSim)
        const custoArredondado = Math.round(custoInsumos)
        // Custo de insumos aqui é só dos itens simulados — o custo do que já
        // foi vendido no mês não é somado (não é rastreado por venda), então
        // o lucro bruto abaixo é uma aproximação, não o fechamento exato do mês.
        const lucroBruto = receitaTotalProjetada - custoArredondado
        const lucroLiquido = lucroBruto - totalDespesas
        const [metaRow] = await db.select().from(dbMeta).where(and(eq(dbMeta.mes, mesSim), eq(dbMeta.ano, anoSim), eq(dbMeta.activeFlag, true)))
        const sugestoes = []
        if (metaRow && receitaTotalProjetada < metaRow.metaReceita && itens.length > 0) {
          const prodRes = await db.execute(sql`SELECT nome, preco_varejo FROM t_produto WHERE produto_id=${itens[0].produtoId} AND active_flg=true`)
          const prod = prodRes.rows[0]
          if (prod) sugestoes.push(`Venda +${Math.ceil((metaRow.metaReceita - receitaTotalProjetada) / Number(prod.preco_varejo ?? 1))} unidades de ${prod.nome} para atingir a meta`)
        }
        if (metaRow && lucroLiquido < metaRow.metaLucro) sugestoes.push(`Reduza despesas ou aumente a receita para atingir a meta de lucro`)
        if (sugestoes.length === 0 && metaRow) sugestoes.push('Projeção atingindo todas as metas!')
        return ok({ receitaJaRealizada, receitaSimulada, receitaTotalProjetada, custoInsumos: custoArredondado, lucroBruto, totalDespesas, lucroLiquido, meta: metaRow ?? null, sugestoes })
      }
      const { mes, ano, metaReceita, metaDespesaMaxima, metaLucro } = body
      const uid = await usuarioAtualIdDb(db)
      await db.execute(sql`INSERT INTO t_meta (mes, ano, meta_receita, meta_despesa_maxima, meta_lucro, created_by, updated_by) VALUES (${mes},${ano},${metaReceita??0},${metaDespesaMaxima??0},${metaLucro??0},${uid},${uid}) ON CONFLICT (mes,ano) DO UPDATE SET meta_receita=${metaReceita??0}, meta_despesa_maxima=${metaDespesaMaxima??0}, meta_lucro=${metaLucro??0}, updated_by=${uid}, updated_dt=NOW()`)
      return ok({ ok: true })
    } finally { release() }
  } catch (err) { return serverError(err) }
}