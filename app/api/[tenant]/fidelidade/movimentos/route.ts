// @ts-nocheck
// ESTE ARQUIVO VAI EM: app/api/[tenant]/fidelidade/movimentos/route.ts
//
// Extrato de movimentações de cashback — aba "Movimentações".
import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { exigirModulo } from '@/lib/auth/permissoes'
import { pool } from '@/lib/db/connection'
import { ok, serverError } from '@/lib/api/responses'

export async function GET(req: NextRequest, { params }: { params: { tenant: string } }) {
  try {
    const tenant = await resolveTenant(params.tenant)
    await exigirModulo(tenant.schemaName, 'fidelidade')
    const { searchParams } = new URL(req.url)
    const page      = Math.max(1, Number(searchParams.get('page') ?? 1))
    const limit     = Math.min(100, Math.max(1, Number(searchParams.get('limit') ?? 30)))
    const tipo      = searchParams.get('tipo') ?? ''
    const clienteId = Number(searchParams.get('clienteId') ?? 0)
    const offset    = (page - 1) * limit

    const client = await pool.connect()
    try {
      await client.query(`SET search_path TO "${tenant.schemaName}", public`)

      const conds: string[] = ['m.active_flg = true']
      const vals: any[] = []
      let idx = 1
      if (tipo)      { conds.push(`m.tipo = $${idx++}`); vals.push(tipo) }
      if (clienteId) { conds.push(`m.cliente_id = $${idx++}`); vals.push(clienteId) }
      const where = `WHERE ${conds.join(' AND ')}`

      const dataRes = await client.query(`
        SELECT m.movimento_id, m.cliente_id, c.nome_completo, m.tipo, m.valor_centavos,
               m.venda_id, m.expira_em, m.observacao, m.created_dt
        FROM t_fidelidade_movimento m
        LEFT JOIN t_cliente c ON c.cliente_id = m.cliente_id
        ${where}
        ORDER BY m.created_dt DESC, m.movimento_id DESC
        LIMIT $${idx++} OFFSET $${idx++}
      `, [...vals, limit, offset])

      const countRes = await client.query(
        `SELECT COUNT(*)::int AS total FROM t_fidelidade_movimento m ${where}`, vals)

      const total = Number(countRes.rows[0]?.total ?? 0)
      const data = dataRes.rows.map(r => ({
        movimentoId:   r.movimento_id,
        clienteId:     r.cliente_id,
        clienteNome:   r.nome_completo ?? '—',
        tipo:          r.tipo,
        valorCentavos: Number(r.valor_centavos ?? 0),
        vendaId:       r.venda_id,
        expiraEm:      r.expira_em,
        observacao:    r.observacao,
        createdDt:     r.created_dt,
      }))

      return ok({ data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } })
    } finally {
      client.release()
    }
  } catch (err) { return serverError(err) }
}