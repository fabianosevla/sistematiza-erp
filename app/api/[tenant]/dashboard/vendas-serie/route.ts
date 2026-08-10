// @ts-nocheck
// ESTE ARQUIVO VAI EM: app/api/[tenant]/dashboard/vendas-serie/route.ts
//
// Série de vendas para o gráfico com seletor do dashboard.
//
//   GET ?periodo=dia | mensal | anual   (padrão: dia)
//
// Rota separada do dashboard principal pelo mesmo motivo do ranking de
// produtos: trocar o período não pode recarregar as outras consultas.
//
// O intervalo é gerado no Postgres (generate_series) e o LEFT JOIN garante
// que todo dia/mês/ano do recorte apareça, mesmo sem venda — sem isso o
// gráfico mostraria só os pontos com movimento, com buracos no eixo.
import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { pool } from '@/lib/db/connection'
import { ok, serverError } from '@/lib/api/responses'

type Params = { params: { tenant: string } }

const MES_BR = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const client = await pool.connect()
    try {
      await client.query(`SET search_path TO "${tenant.schemaName}", public`)

      const { searchParams } = new URL(req.url)
      const periodo = searchParams.get('periodo') ?? 'dia'

      let sql: string
      let formatarLabel: (v: Date) => string

      if (periodo === 'mensal') {
        sql = `
          WITH baldes AS (
            SELECT generate_series(
              DATE_TRUNC('month', NOW()) - INTERVAL '11 months',
              DATE_TRUNC('month', NOW()), INTERVAL '1 month'
            ) AS balde
          )
          SELECT b.balde,
                 COALESCE(SUM(v.total), 0)::bigint AS valor,
                 COUNT(v.venda_id)::int AS qtd
          FROM baldes b
          LEFT JOIN t_venda v ON v.active_flg = true
            AND DATE_TRUNC('month', v.vendida_em) = b.balde
          GROUP BY b.balde ORDER BY b.balde
        `
        formatarLabel = (d) => `${MES_BR[d.getUTCMonth()]}/${String(d.getUTCFullYear()).slice(-2)}`
      } else if (periodo === 'anual') {
        sql = `
          WITH baldes AS (
            SELECT generate_series(
              DATE_TRUNC('year', NOW()) - INTERVAL '4 years',
              DATE_TRUNC('year', NOW()), INTERVAL '1 year'
            ) AS balde
          )
          SELECT b.balde,
                 COALESCE(SUM(v.total), 0)::bigint AS valor,
                 COUNT(v.venda_id)::int AS qtd
          FROM baldes b
          LEFT JOIN t_venda v ON v.active_flg = true
            AND DATE_TRUNC('year', v.vendida_em) = b.balde
          GROUP BY b.balde ORDER BY b.balde
        `
        formatarLabel = (d) => String(d.getUTCFullYear())
      } else {
        // dia: últimos 14 dias corridos, no fuso da loja.
        sql = `
          WITH baldes AS (
            SELECT generate_series(
              (CURRENT_DATE AT TIME ZONE 'America/Sao_Paulo') - INTERVAL '13 days',
              (CURRENT_DATE AT TIME ZONE 'America/Sao_Paulo'), INTERVAL '1 day'
            ) AS balde
          )
          SELECT b.balde,
                 COALESCE(SUM(v.total), 0)::bigint AS valor,
                 COUNT(v.venda_id)::int AS qtd
          FROM baldes b
          LEFT JOIN t_venda v ON v.active_flg = true
            AND (v.vendida_em AT TIME ZONE 'America/Sao_Paulo')::date = b.balde::date
          GROUP BY b.balde ORDER BY b.balde
        `
        formatarLabel = (d) => `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`
      }

      const r = await client.query(sql)

      const itens = r.rows.map(row => ({
        label: formatarLabel(new Date(row.balde)),
        valor: Number(row.valor ?? 0) / 100,
        qtd:   Number(row.qtd ?? 0),
      }))

      return ok({ periodo, itens })
    } finally {
      client.release()
    }
  } catch (err) {
    return serverError(err)
  }
}
