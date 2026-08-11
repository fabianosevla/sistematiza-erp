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

      const [
        kpisHoje, pedidosStatus, producaoHoje, estCritico, caixaDia, vendasPorHora,
      ] = await Promise.all([
        client.query(`
          SELECT
            COALESCE(SUM(CASE WHEN DATE_TRUNC('day', vendida_em AT TIME ZONE 'America/Sao_Paulo')
                              = DATE_TRUNC('day', NOW() AT TIME ZONE 'America/Sao_Paulo')
                         THEN total ELSE 0 END), 0)::bigint as receita_hoje,
            COALESCE(SUM(CASE WHEN DATE_TRUNC('day', vendida_em AT TIME ZONE 'America/Sao_Paulo')
                              = DATE_TRUNC('day', NOW() AT TIME ZONE 'America/Sao_Paulo') - INTERVAL '1 day'
                         THEN total ELSE 0 END), 0)::bigint as receita_ontem
          FROM t_venda WHERE active_flg=true
        `),
        // Só os três status que ainda pedem atenção — entregue e cancelado já
        // saíram do fluxo. A soma dos três é o número de "pedidos em aberto".
        client.query(`
          SELECT status, COUNT(*)::int as qtd
          FROM t_pedido
          WHERE active_flg=true AND status IN ('pendente','producao','pronto')
          GROUP BY status
        `),
        // Previsto (t_producao_semanal, a grade) x realizado (t_producao_registro,
        // o que de fato foi lançado) para hoje.
        //
        // "Hoje" tem que ser o dia em São Paulo, não CURRENT_DATE cru — esse
        // depende do timezone da sessão do Postgres (geralmente UTC no
        // servidor), que vira ontem ou amanhã perto da virada da meia-noite
        // daqui. Mesma conversão que já era usada em receita_hoje acima.
        client.query(`
          SELECT
            COALESCE((SELECT SUM(quantidade) FROM t_producao_semanal
                       WHERE active_flg=true
                         AND data_producao = (NOW() AT TIME ZONE 'America/Sao_Paulo')::date), 0)::int as previsto,
            COALESCE((SELECT SUM(qtd_produzida) FROM t_producao_registro
                       WHERE data_producao = (NOW() AT TIME ZONE 'America/Sao_Paulo')::date), 0)::int as realizado
        `).catch(() => ({ rows: [{ previsto: 0, realizado: 0 }] })),
        client.query(`
          SELECT COUNT(*)::int as qtd FROM (
            SELECT 1 FROM t_produto
             WHERE active_flg=true AND estoque_minimo > 0 AND estoque_atual <= estoque_minimo
            UNION ALL
            SELECT 1 FROM t_insumo
             WHERE active_flg=true AND estoque_minimo > 0 AND estoque_atual <= estoque_minimo
          ) x
        `),
        // Turnos fechados HOJE (em São Paulo) e os que ainda estão abertos.
        // "Vendido hoje" não sai daqui — venda de pedido (baixa de conta a
        // receber) não passa por turno, e contar só o que tem turno_id
        // deixava esse dinheiro de fora. Vendido hoje = receita_hoje acima,
        // que já soma TODA venda ativa do dia, com ou sem turno.
        client.query(`
          SELECT
            COUNT(*) FILTER (WHERE status = 'aberto')::int AS caixas_abertos,
            COUNT(*) FILTER (
              WHERE status = 'fechado'
                AND (fechado_em AT TIME ZONE 'America/Sao_Paulo')::date
                    = (NOW() AT TIME ZONE 'America/Sao_Paulo')::date
            )::int AS turnos_fechados,
            COALESCE(SUM(diferenca) FILTER (
              WHERE status = 'fechado'
                AND (fechado_em AT TIME ZONE 'America/Sao_Paulo')::date
                    = (NOW() AT TIME ZONE 'America/Sao_Paulo')::date
            ), 0)::bigint AS diferenca_hoje
          FROM t_turno_caixa
          WHERE active_flg = true
            AND (
              status = 'aberto'
              OR (fechado_em AT TIME ZONE 'America/Sao_Paulo')::date
                 = (NOW() AT TIME ZONE 'America/Sao_Paulo')::date
            )
        `).catch(() => ({ rows: [{ caixas_abertos: 0, turnos_fechados: 0, diferenca_hoje: 0 }] })),
        // Vendido por hora hoje — alimenta o gráfico do card de Caixa. As 24
        // horas sempre aparecem (generate_series + LEFT JOIN), até as que
        // ainda não chegaram: ficam zeradas, não somem do eixo.
        client.query(`
          WITH horas AS (SELECT generate_series(0, 23) AS hora)
          SELECT h.hora,
                 COALESCE(SUM(v.total), 0)::bigint AS valor
          FROM horas h
          LEFT JOIN t_venda v ON v.active_flg = true
            AND (v.vendida_em AT TIME ZONE 'America/Sao_Paulo')::date
                = (NOW() AT TIME ZONE 'America/Sao_Paulo')::date
            AND EXTRACT(HOUR FROM (v.vendida_em AT TIME ZONE 'America/Sao_Paulo'))::int = h.hora
          GROUP BY h.hora ORDER BY h.hora
        `).catch(() => ({ rows: [] })),
      ])

      const kpi  = kpisHoje.rows[0] ?? {}
      const prod = producaoHoje.rows[0] ?? { previsto: 0, realizado: 0 }
      const cx   = caixaDia.rows[0] ?? { caixas_abertos: 0, turnos_fechados: 0, diferenca_hoje: 0 }

      const porStatus: Record<string, number> = { pendente: 0, producao: 0, pronto: 0 }
      for (const r of pedidosStatus.rows) porStatus[r.status] = Number(r.qtd)

      return ok({
        receitaHoje:  Number(kpi.receita_hoje  ?? 0) / 100,
        receitaOntem: Number(kpi.receita_ontem ?? 0) / 100,
        pedidosPorStatus: porStatus,
        pedidosAbertos:   porStatus.pendente + porStatus.producao + porStatus.pronto,
        producaoHoje: {
          previsto:  Number(prod.previsto),
          realizado: Number(prod.realizado),
        },
        estoqueCriticoQtd: Number(estCritico.rows[0]?.qtd ?? 0),
        caixaDia: {
          caixasAbertos:  Number(cx.caixas_abertos),
          turnosFechados: Number(cx.turnos_fechados),
          vendidoHoje:    Number(kpi.receita_hoje ?? 0) / 100,
          diferencaHoje:  Number(cx.diferenca_hoje) / 100,
        },
        vendasPorHora: vendasPorHora.rows.map(r => ({ hora: Number(r.hora), valor: Number(r.valor) / 100 })),
      })
    } finally {
      client.release()
    }
  } catch (err) {
    return serverError(err)
  }
}
