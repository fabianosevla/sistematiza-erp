// @ts-nocheck
import type { NextRequest } from 'next/server'
import { eq, and, sql } from 'drizzle-orm'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { pool } from '@/lib/db/connection'
import { dbMeta } from '@/lib/db/schemas/metas'
import { ok, serverError } from '@/lib/api/responses'

type Params = { params: { tenant: string } }

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
          WHERE p.status IN ('pendente','producao') AND p.active_flg = true
            AND pi.active_flg = true
          GROUP BY pi.produto_id
        `).catch(() => ({ rows: [] }))
        const pedidosPorProduto = {}
        for (const r of pedidosRes.rows) pedidosPorProduto[r.produto_id] = Number(r.qtd_pendente)
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
          return { produtoId: row.produto_id, nome: row.nome, mediaVendas: Math.round(mediaVendas * 10) / 10, pedidosPendentes: pendentes, previsaoProducao, receitaEstimada }
        })
        const insumos = Object.values(insumosAgregados).sort((a, b) => b.necessario - a.necessario).map(i => ({ ...i, necessario: Math.round(i.necessario * 1000) / 1000, custoEstimado: Math.round(i.custoEstimado) }))
        return ok({ produtos, insumos, totalReceitaEstimada, totalCustoInsumos: Math.round(totalCustoInsumos), mesesHistorico, mesAlvo: { mes, ano } })
      } finally { client.release() }
    }

    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const [meta] = await db.select().from(dbMeta).where(and(eq(dbMeta.mes, mes), eq(dbMeta.ano, ano), eq(dbMeta.activeFlag, true)))
      const receitaRes = await db.execute(sql`SELECT COALESCE(SUM(total),0)::bigint as receita FROM t_venda WHERE active_flg=true AND EXTRACT(MONTH FROM vendida_em)=${mes} AND EXTRACT(YEAR FROM vendida_em)=${ano}`)
      const despesaRes = await db.execute(sql`SELECT COALESCE(SUM(valor),0)::bigint as despesa FROM t_despesa WHERE active_flg=true AND mes_competencia=${mes} AND ano_competencia=${ano}`)
      const receita = Number(receitaRes.rows[0]?.receita ?? 0)
      const despesa = Number(despesaRes.rows[0]?.despesa ?? 0)
      const lucro = receita - despesa
      return ok({ meta: meta ?? { metaReceita: 0, metaDespesaMaxima: 0, metaLucro: 0, mes, ano }, real: { receita, despesa, lucro }, progresso: { receita: meta?.metaReceita > 0 ? Math.min(100, (receita/meta.metaReceita)*100) : null, despesa: meta?.metaDespesaMaxima > 0 ? Math.min(100, (despesa/meta.metaDespesaMaxima)*100) : null, lucro: meta?.metaLucro > 0 ? Math.min(100, (lucro/meta.metaLucro)*100) : null } })
    } finally { release() }
  } catch (err) { return serverError(err) }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const body = await req.json()
      if (body.tipo === 'simular') {
        const itens = body.itens ?? []
        let receitaProjetada = 0, custoInsumos = 0
        for (const item of itens) {
          const prodRes = await db.execute(sql`SELECT preco_varejo FROM t_produto WHERE produto_id=${item.produtoId} AND active_flg=true`)
          receitaProjetada += item.quantidade * Number(prodRes.rows[0]?.preco_varejo ?? 0)
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
        const despesasRes = await db.execute(sql`SELECT COALESCE(SUM(valor),0)::bigint as total FROM t_despesa WHERE active_flg=true AND mes_competencia=${mesSim} AND ano_competencia=${anoSim}`)
        const gastosRes = await db.execute(sql`SELECT COALESCE(SUM(valor),0)::bigint as total FROM t_gasto_fixo_valor WHERE active_flg=true AND mes=${mesSim} AND ano=${anoSim}`).catch(() => ({ rows: [{ total: 0 }] }))
        const totalDespesas = Number(despesasRes.rows[0]?.total ?? 0) + Number(gastosRes.rows[0]?.total ?? 0)
        const custoArredondado = Math.round(custoInsumos)
        const lucroBruto = receitaProjetada - custoArredondado
        const lucroLiquido = lucroBruto - totalDespesas
        const [metaRow] = await db.select().from(dbMeta).where(and(eq(dbMeta.mes, mesSim), eq(dbMeta.ano, anoSim), eq(dbMeta.activeFlag, true)))
        const sugestoes = []
        if (metaRow && receitaProjetada < metaRow.metaReceita && itens.length > 0) {
          const prodRes = await db.execute(sql`SELECT nome, preco_varejo FROM t_produto WHERE produto_id=${itens[0].produtoId} AND active_flg=true`)
          const prod = prodRes.rows[0]
          if (prod) sugestoes.push(`Venda +${Math.ceil((metaRow.metaReceita - receitaProjetada) / Number(prod.preco_varejo ?? 1))} unidades de ${prod.nome} para atingir a meta`)
        }
        if (metaRow && lucroLiquido < metaRow.metaLucro) sugestoes.push(`Reduza despesas ou aumente a receita para atingir a meta de lucro`)
        if (sugestoes.length === 0 && metaRow) sugestoes.push('Projeção atingindo todas as metas!')
        return ok({ receitaProjetada, custoInsumos: custoArredondado, lucroBruto, totalDespesas, lucroLiquido, meta: metaRow ?? null, sugestoes })
      }
      const { mes, ano, metaReceita, metaDespesaMaxima, metaLucro } = body
      await db.execute(sql`INSERT INTO t_meta (mes, ano, meta_receita, meta_despesa_maxima, meta_lucro, created_by, updated_by) VALUES (${mes},${ano},${metaReceita??0},${metaDespesaMaxima??0},${metaLucro??0},1,1) ON CONFLICT (mes,ano) DO UPDATE SET meta_receita=${metaReceita??0}, meta_despesa_maxima=${metaDespesaMaxima??0}, meta_lucro=${metaLucro??0}, updated_dt=NOW()`)
      return ok({ ok: true })
    } finally { release() }
  } catch (err) { return serverError(err) }
}