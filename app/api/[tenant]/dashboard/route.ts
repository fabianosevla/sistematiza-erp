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
        kpisHoje, pedidosStatus, producaoHoje, estCritico, caixaDia,
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
        client.query(`
          SELECT
            COALESCE((SELECT SUM(quantidade) FROM t_producao_semanal
                       WHERE active_flg=true AND data_producao = CURRENT_DATE), 0)::int as previsto,
            COALESCE((SELECT SUM(qtd_produzida) FROM t_producao_registro
                       WHERE data_producao = CURRENT_DATE), 0)::int as realizado
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
        // Caixa do dia inteiro, agregado — não por operador. Cobre tanto o
        // turno que está aberto agora quanto os que já abriram ou fecharam
        // hoje, pra "fechado" não virar tela em branco: o comércio continua
        // tendo um dia, mesmo sem ninguém no caixa neste instante.
        client.query(`
          SELECT
            COUNT(*) FILTER (WHERE x.status = 'aberto')::int  AS caixas_abertos,
            COUNT(*) FILTER (WHERE x.status = 'fechado')::int AS turnos_fechados,
            COALESCE(SUM(x.vendido), 0)::bigint                AS vendido_hoje,
            COALESCE(SUM(x.diferenca) FILTER (WHERE x.status = 'fechado'), 0)::bigint AS diferenca_hoje
          FROM (
            SELECT t.turno_id, t.status, t.diferenca,
                   COALESCE((SELECT SUM(v.total) FROM t_venda v
                              WHERE v.turno_id = t.turno_id AND v.active_flg = true), 0) AS vendido
            FROM t_turno_caixa t
            WHERE t.active_flg = true
              AND (t.status = 'aberto' OR t.aberto_em::date = CURRENT_DATE OR t.fechado_em::date = CURRENT_DATE)
          ) x
        `).catch(() => ({ rows: [{ caixas_abertos: 0, turnos_fechados: 0, vendido_hoje: 0, diferenca_hoje: 0 }] })),
      ])

      const kpi  = kpisHoje.rows[0] ?? {}
      const prod = producaoHoje.rows[0] ?? { previsto: 0, realizado: 0 }
      const cx   = caixaDia.rows[0] ?? { caixas_abertos: 0, turnos_fechados: 0, vendido_hoje: 0, diferenca_hoje: 0 }

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
          vendidoHoje:    Number(cx.vendido_hoje) / 100,
          diferencaHoje:  Number(cx.diferenca_hoje) / 100,
        },
      })
    } finally {
      client.release()
    }
  } catch (err) {
    return serverError(err)
  }
}
