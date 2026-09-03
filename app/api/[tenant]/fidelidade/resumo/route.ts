// @ts-nocheck
// ESTE ARQUIVO VAI EM: app/api/[tenant]/fidelidade/resumo/route.ts
//
// KPIs da aba "Visão Geral" do módulo Fidelidade.
import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { exigirModulo } from '@/lib/auth/permissoes'
import { pool } from '@/lib/db/connection'
import { ok, serverError } from '@/lib/api/responses'

const SINAL_SQL = `
  CASE
    WHEN tipo = 'credito' AND (expira_em IS NULL OR expira_em >= NOW()) THEN valor_centavos
    WHEN tipo IN ('estorno','ajuste')                                   THEN valor_centavos
    WHEN tipo IN ('uso','expiracao','estorno_credito')                  THEN -valor_centavos
    ELSE 0
  END
`

export async function GET(_req: NextRequest, { params }: { params: { tenant: string } }) {
  try {
    const tenant = await resolveTenant(params.tenant)
    await exigirModulo(tenant.schemaName, 'fidelidade')
    const client = await pool.connect()
    try {
      await client.query(`SET search_path TO "${tenant.schemaName}", public`)

      const [saldos, totais, avisos] = await Promise.all([
        client.query(`
          WITH saldos AS (
            SELECT cliente_id, SUM(${SINAL_SQL}) AS saldo
            FROM t_fidelidade_movimento WHERE active_flg = true
            GROUP BY cliente_id
          )
          SELECT
            COALESCE(SUM(GREATEST(saldo, 0)), 0)::bigint AS saldo_circulante,
            COUNT(*) FILTER (WHERE saldo > 0)::int       AS clientes_com_saldo
          FROM saldos
        `),
        client.query(`
          SELECT
            COALESCE(SUM(valor_centavos) FILTER (WHERE tipo = 'credito'), 0)::bigint AS creditado_total,
            COALESCE(SUM(valor_centavos) FILTER (WHERE tipo = 'uso'), 0)::bigint     AS usado_total,
            COALESCE(SUM(valor_centavos) FILTER (WHERE tipo = 'credito' AND created_dt >= date_trunc('month', NOW() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'), 0)::bigint AS creditado_mes,
            COALESCE(SUM(valor_centavos) FILTER (WHERE tipo = 'uso'     AND created_dt >= date_trunc('month', NOW() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'), 0)::bigint AS usado_mes
          FROM t_fidelidade_movimento WHERE active_flg = true
        `),
        client.query(`
          SELECT
            COUNT(*) FILTER (WHERE status = 'enviado' AND enviado_em >= NOW() - INTERVAL '30 days')::int AS avisos_30d,
            COUNT(*) FILTER (WHERE status = 'erro'    AND created_dt >= NOW() - INTERVAL '30 days')::int AS erros_30d
          FROM t_fidelidade_aviso WHERE active_flg = true
        `).catch(() => ({ rows: [{ avisos_30d: 0, erros_30d: 0 }] })),
      ])

      const s = saldos.rows[0] ?? {}
      const t = totais.rows[0] ?? {}
      const a = avisos.rows[0] ?? {}

      return ok({
        saldoCirculante:  Number(s.saldo_circulante ?? 0),
        clientesComSaldo: Number(s.clientes_com_saldo ?? 0),
        creditadoTotal:   Number(t.creditado_total ?? 0),
        usadoTotal:       Number(t.usado_total ?? 0),
        creditadoMes:     Number(t.creditado_mes ?? 0),
        usadoMes:         Number(t.usado_mes ?? 0),
        avisos30d:        Number(a.avisos_30d ?? 0),
        erros30d:         Number(a.erros_30d ?? 0),
      })
    } finally {
      client.release()
    }
  } catch (err) { return serverError(err) }
}