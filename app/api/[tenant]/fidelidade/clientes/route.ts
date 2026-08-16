// @ts-nocheck
// ESTE ARQUIVO VAI EM: app/api/[tenant]/fidelidade/clientes/route.ts
//
// Clientes com saldo de cashback — aba "Clientes & Saldo".
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

export async function GET(req: NextRequest, { params }: { params: { tenant: string } }) {
  try {
    const tenant = await resolveTenant(params.tenant)
    await exigirModulo(tenant.schemaName, 'fidelidade')
    const { searchParams } = new URL(req.url)
    const page   = Math.max(1, Number(searchParams.get('page') ?? 1))
    const limit  = Math.min(100, Math.max(1, Number(searchParams.get('limit') ?? 20)))
    const search = searchParams.get('search') ?? ''
    const offset = (page - 1) * limit

    const client = await pool.connect()
    try {
      await client.query(`SET search_path TO "${tenant.schemaName}", public`)

      const vals: any[] = []
      let searchClause = ''
      if (search) {
        searchClause = `AND LOWER(c.nome_completo) LIKE $1`
        vals.push(`%${search.toLowerCase()}%`)
      }

      const baseCte = `
        WITH saldos AS (
          SELECT cliente_id,
                 SUM(${SINAL_SQL})                                    AS saldo,
                 COALESCE(SUM(valor_centavos) FILTER (WHERE tipo='credito'), 0) AS total_ganho,
                 COALESCE(SUM(valor_centavos) FILTER (WHERE tipo='uso'), 0)     AS total_usado
          FROM t_fidelidade_movimento WHERE active_flg = true
          GROUP BY cliente_id
        )
      `

      const dataRes = await client.query(`
        ${baseCte}
        SELECT s.cliente_id, c.nome_completo, c.telefone, c.celular, c.documento,
               s.saldo::bigint AS saldo, s.total_ganho::bigint AS total_ganho, s.total_usado::bigint AS total_usado,
               (SELECT MAX(vendida_em) FROM t_venda v WHERE v.cliente_id = s.cliente_id AND v.active_flg = true) AS ultima_compra
        FROM saldos s
        JOIN t_cliente c ON c.cliente_id = s.cliente_id
        WHERE s.saldo > 0 ${searchClause}
        ORDER BY s.saldo DESC
        LIMIT $${vals.length + 1} OFFSET $${vals.length + 2}
      `, [...vals, limit, offset])

      const countRes = await client.query(`
        ${baseCte}
        SELECT COUNT(*)::int AS total
        FROM saldos s
        JOIN t_cliente c ON c.cliente_id = s.cliente_id
        WHERE s.saldo > 0 ${searchClause}
      `, vals)

      const total = Number(countRes.rows[0]?.total ?? 0)
      const data = dataRes.rows.map(r => ({
        clienteId:    r.cliente_id,
        nome:         r.nome_completo,
        telefone:     r.telefone ?? r.celular ?? null,
        documento:    r.documento ?? null,
        saldo:        Number(r.saldo ?? 0),
        totalGanho:   Number(r.total_ganho ?? 0),
        totalUsado:   Number(r.total_usado ?? 0),
        ultimaCompra: r.ultima_compra,
      }))

      return ok({ data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } })
    } finally {
      client.release()
    }
  } catch (err) { return serverError(err) }
}