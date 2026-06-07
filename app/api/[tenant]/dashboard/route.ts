// @ts-nocheck
import type { NextRequest } from 'next/server'
import { sql } from 'drizzle-orm'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { ok, serverError } from '@/lib/api/responses'

type Params = { params: { tenant: string } }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const [fat6m, vendasDia, topProd, receita6m, despesas6m, estCritico, porForma] = await Promise.all([
        db.execute(sql`
          SELECT TO_CHAR(DATE_TRUNC('month', vendida_em), 'Mon/YY') as mes,
                 COALESCE(SUM(total),0)::bigint as valor, COUNT(*)::int as qtd
          FROM t_venda WHERE active_flg=true AND vendida_em >= NOW()-INTERVAL '6 months'
          GROUP BY DATE_TRUNC('month', vendida_em) ORDER BY DATE_TRUNC('month', vendida_em)
        `),
        db.execute(sql`
          SELECT EXTRACT(DAY FROM vendida_em)::int as dia, COALESCE(SUM(total),0)::bigint as valor
          FROM t_venda WHERE active_flg=true
            AND DATE_TRUNC('month', vendida_em)=DATE_TRUNC('month', NOW())
          GROUP BY EXTRACT(DAY FROM vendida_em) ORDER BY dia
        `),
        db.execute(sql`
          SELECT vi.nome_produto, COALESCE(SUM(vi.quantidade),0)::int as qtd,
                 COALESCE(SUM(vi.subtotal),0)::bigint as valor
          FROM t_venda_item vi JOIN t_venda v ON vi.venda_id=v.venda_id
          WHERE v.active_flg=true AND v.vendida_em>=DATE_TRUNC('month',NOW())
          GROUP BY vi.nome_produto ORDER BY qtd DESC LIMIT 5
        `),
        db.execute(sql`
          SELECT TO_CHAR(DATE_TRUNC('month', vendida_em), 'Mon/YY') as mes,
                 COALESCE(SUM(total),0)::bigint as valor
          FROM t_venda WHERE active_flg=true AND vendida_em >= NOW()-INTERVAL '6 months'
          GROUP BY DATE_TRUNC('month', vendida_em) ORDER BY DATE_TRUNC('month', vendida_em)
        `),
        db.execute(sql`
          SELECT TO_CHAR(DATE_TRUNC('month', data_despesa), 'Mon/YY') as mes,
                 COALESCE(SUM(valor),0)::bigint as valor
          FROM t_despesa WHERE active_flg=true AND data_despesa >= NOW()-INTERVAL '6 months'
          GROUP BY DATE_TRUNC('month', data_despesa) ORDER BY DATE_TRUNC('month', data_despesa)
        `),
        db.execute(sql`
          SELECT nome, estoque_atual, estoque_minimo FROM t_produto
          WHERE active_flg=true AND estoque_atual<=estoque_minimo ORDER BY estoque_atual LIMIT 8
        `),
        db.execute(sql`
          SELECT vp.forma, COALESCE(SUM(vp.valor),0)::bigint as total
          FROM t_venda_pagamento vp JOIN t_venda v ON vp.venda_id=v.venda_id
          WHERE v.active_flg=true AND v.vendida_em>=DATE_TRUNC('month',NOW())
          GROUP BY vp.forma ORDER BY total DESC
        `),
      ])

      // Merge receita6m + despesas6m
      const mesesSet = new Set([...(receita6m.rows as any[]).map(r => r.mes), ...(despesas6m.rows as any[]).map(r => r.mes)])
      const receitaVsDespesas = Array.from(mesesSet).map(mes => ({
        mes,
        receita:  Number((receita6m.rows as any[]).find(r => r.mes === mes)?.valor ?? 0) / 100,
        despesas: Number((despesas6m.rows as any[]).find(r => r.mes === mes)?.valor ?? 0) / 100,
      }))

      return ok({
        faturamento6m:     (fat6m.rows as any[]).map(r => ({ mes: r.mes, valor: Number(r.valor)/100, qtd: Number(r.qtd) })),
        vendasDia:         (vendasDia.rows as any[]).map(r => ({ dia: String(r.dia), valor: Number(r.valor)/100 })),
        topProdutos:       (topProd.rows as any[]).map(r => ({ nome: r.nome_produto, qtd: Number(r.qtd), valor: Number(r.valor)/100 })),
        receitaVsDespesas,
        estoqueCritico:    (estCritico.rows as any[]).map(r => ({ nome: r.nome, estoqueAtual: Number(r.estoque_atual), estoqueMinimo: Number(r.estoque_minimo) })),
        porForma:          (porForma.rows as any[]).map(r => ({ forma: r.forma, valor: Number(r.total)/100 })),
      })
    } finally { release() }
  } catch (err) { return serverError(err) }
}