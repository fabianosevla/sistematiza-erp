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
        kpisHoje, pedidosStatus, producaoHoje, estCritico, caixaAberto, contasAVencer,
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
        // Turnos de caixa abertos agora, com o vendido de cada um.
        client.query(`
          SELECT t.turno_id, t.numero_caixa, t.operador, t.aberto_em, t.valor_abertura,
                 COALESCE((SELECT SUM(v.total) FROM t_venda v
                            WHERE v.turno_id = t.turno_id AND v.active_flg = true), 0)::bigint as vendido
          FROM t_turno_caixa t
          WHERE t.status = 'aberto' AND t.active_flg = true
          ORDER BY t.aberto_em
        `).catch(() => ({ rows: [] })),
        // Contas a pagar/receber vencendo nos próximos 7 dias, ainda abertas.
        client.query(`
          SELECT
            COALESCE((SELECT COUNT(*) FROM t_conta_receber
                       WHERE status = 'aberta'
                         AND data_vencimento BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'), 0)::int as receber_qtd,
            COALESCE((SELECT SUM(valor_original - valor_recebido) FROM t_conta_receber
                       WHERE status = 'aberta'
                         AND data_vencimento BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'), 0)::bigint as receber_valor,
            COALESCE((SELECT COUNT(*) FROM t_conta_pagar
                       WHERE status = 'aberta'
                         AND data_vencimento BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'), 0)::int as pagar_qtd,
            COALESCE((SELECT SUM(valor_original - valor_pago) FROM t_conta_pagar
                       WHERE status = 'aberta'
                         AND data_vencimento BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'), 0)::bigint as pagar_valor
        `).catch(() => ({ rows: [{ receber_qtd: 0, receber_valor: 0, pagar_qtd: 0, pagar_valor: 0 }] })),
      ])

      const kpi  = kpisHoje.rows[0] ?? {}
      const prod = producaoHoje.rows[0] ?? { previsto: 0, realizado: 0 }
      const cta  = contasAVencer.rows[0] ?? { receber_qtd: 0, receber_valor: 0, pagar_qtd: 0, pagar_valor: 0 }

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
        caixaAberto: caixaAberto.rows.map(r => ({
          turnoId:       r.turno_id,
          numeroCaixa:   r.numero_caixa,
          operador:      r.operador,
          abertoEm:      r.aberto_em,
          valorAbertura: Number(r.valor_abertura) / 100,
          vendido:       Number(r.vendido) / 100,
        })),
        contasAVencer: {
          receber: { qtd: Number(cta.receber_qtd), valor: Number(cta.receber_valor) / 100 },
          pagar:   { qtd: Number(cta.pagar_qtd),   valor: Number(cta.pagar_valor)   / 100 },
        },
      })
    } finally {
      client.release()
    }
  } catch (err) {
    return serverError(err)
  }
}
