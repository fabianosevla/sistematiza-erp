// @ts-nocheck
import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { pool } from '@/lib/db/connection'
import { ok, serverError } from '@/lib/api/responses'

type Params = { params: { tenant: string } }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const client = await pool.connect()
    try {
      await client.query(`SET search_path TO "${tenant.schemaName}", public`)

      const [fat6m, vendasDia, topProd, receita6m, despesas6m, estCritico, porForma, kpisHoje] = await Promise.all([
        client.query(`
          SELECT TO_CHAR(DATE_TRUNC('month', vendida_em), 'Mon/YY') as mes,
                 COALESCE(SUM(total),0)::bigint as valor, COUNT(*)::int as qtd
          FROM t_venda WHERE active_flg=true AND vendida_em >= NOW()-INTERVAL '6 months'
          GROUP BY DATE_TRUNC('month', vendida_em) ORDER BY DATE_TRUNC('month', vendida_em)
        `),
        client.query(`
          SELECT EXTRACT(DAY FROM vendida_em AT TIME ZONE 'America/Sao_Paulo')::int as dia,
                 COALESCE(SUM(total),0)::bigint as valor
          FROM t_venda WHERE active_flg=true
            AND DATE_TRUNC('month', vendida_em AT TIME ZONE 'America/Sao_Paulo')
                = DATE_TRUNC('month', NOW() AT TIME ZONE 'America/Sao_Paulo')
          GROUP BY EXTRACT(DAY FROM vendida_em AT TIME ZONE 'America/Sao_Paulo')
          ORDER BY dia
        `),
        client.query(`
          SELECT vi.nome_produto, COALESCE(SUM(vi.quantidade),0)::int as qtd,
                 COALESCE(SUM(vi.subtotal),0)::bigint as valor
          FROM t_venda_item vi JOIN t_venda v ON vi.venda_id=v.venda_id
          WHERE v.active_flg=true
            AND DATE_TRUNC('month', v.vendida_em AT TIME ZONE 'America/Sao_Paulo')
                = DATE_TRUNC('month', NOW() AT TIME ZONE 'America/Sao_Paulo')
          GROUP BY vi.nome_produto ORDER BY qtd DESC LIMIT 5
        `),
        client.query(`
          SELECT TO_CHAR(DATE_TRUNC('month', vendida_em), 'Mon/YY') as mes,
                 COALESCE(SUM(total),0)::bigint as valor
          FROM t_venda WHERE active_flg=true AND vendida_em >= NOW()-INTERVAL '6 months'
          GROUP BY DATE_TRUNC('month', vendida_em) ORDER BY DATE_TRUNC('month', vendida_em)
        `),
        client.query(`
          SELECT TO_CHAR(DATE_TRUNC('month', data_despesa), 'Mon/YY') as mes,
                 COALESCE(SUM(valor),0)::bigint as valor
          FROM t_despesa WHERE active_flg=true AND data_despesa >= NOW()-INTERVAL '6 months'
          GROUP BY DATE_TRUNC('month', data_despesa) ORDER BY DATE_TRUNC('month', data_despesa)
        `).catch(() => ({ rows: [] })),
        client.query(`
          SELECT nome, estoque_atual, estoque_minimo FROM t_produto
          WHERE active_flg=true AND estoque_atual<=estoque_minimo ORDER BY estoque_atual LIMIT 8
        `),
        client.query(`
          SELECT vp.forma, COALESCE(SUM(vp.valor),0)::bigint as total
          FROM t_venda_pagamento vp JOIN t_venda v ON vp.venda_id=v.venda_id
          WHERE v.active_flg=true
            AND DATE_TRUNC('month', v.vendida_em AT TIME ZONE 'America/Sao_Paulo')
                = DATE_TRUNC('month', NOW() AT TIME ZONE 'America/Sao_Paulo')
          GROUP BY vp.forma ORDER BY total DESC
        `),
        client.query(`
          SELECT
            COALESCE(SUM(CASE WHEN DATE_TRUNC('day', vendida_em AT TIME ZONE 'America/Sao_Paulo')
                              = DATE_TRUNC('day', NOW() AT TIME ZONE 'America/Sao_Paulo')
                         THEN total ELSE 0 END), 0)::bigint as receita_hoje,
            COALESCE(SUM(CASE WHEN DATE_TRUNC('month', vendida_em AT TIME ZONE 'America/Sao_Paulo')
                              = DATE_TRUNC('month', NOW() AT TIME ZONE 'America/Sao_Paulo')
                         THEN total ELSE 0 END), 0)::bigint as receita_mes,
            COUNT(CASE WHEN DATE_TRUNC('month', vendida_em AT TIME ZONE 'America/Sao_Paulo')
                            = DATE_TRUNC('month', NOW() AT TIME ZONE 'America/Sao_Paulo')
                  THEN 1 END)::int as qtd_mes
          FROM t_venda WHERE active_flg=true
        `),
      ])

      const mesesSet = new Set([...receita6m.rows.map(r => r.mes), ...despesas6m.rows.map(r => r.mes)])
      const receitaVsDespesas = Array.from(mesesSet).map(mes => ({
        mes,
        receita:  Number(receita6m.rows.find(r => r.mes === mes)?.valor ?? 0) / 100,
        despesas: Number(despesas6m.rows.find(r => r.mes === mes)?.valor ?? 0) / 100,
      }))

      const kpi = kpisHoje.rows[0] ?? {}

      return ok({
        receitaHoje:       Number(kpi.receita_hoje ?? 0) / 100,
        receitaMes:        Number(kpi.receita_mes ?? 0) / 100,
        qtdMes:            Number(kpi.qtd_mes ?? 0),
        faturamento6m:     fat6m.rows.map(r => ({ mes: r.mes, valor: Number(r.valor)/100, qtd: Number(r.qtd) })),
        vendasDia:         vendasDia.rows.map(r => ({ dia: String(r.dia), valor: Number(r.valor)/100 })),
        topProdutos:       topProd.rows.map(r => ({ nome: r.nome_produto, qtd: Number(r.qtd), valor: Number(r.valor)/100 })),
        receitaVsDespesas,
        estoqueCritico:    estCritico.rows.map(r => ({ nome: r.nome, estoqueAtual: Number(r.estoque_atual), estoqueMinimo: Number(r.estoque_minimo) })),
        porForma:          porForma.rows.map(r => ({ forma: r.forma, valor: Number(r.total)/100 })),
      })
    } finally {
      client.release()
    }
  } catch (err) {
    return serverError(err)
  }
}