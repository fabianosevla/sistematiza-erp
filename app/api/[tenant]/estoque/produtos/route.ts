// @ts-nocheck
import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { pool } from '@/lib/db/connection'
import { ok, serverError } from '@/lib/api/responses'
type Params = { params: { tenant: string } }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { searchParams } = new URL(req.url)
    const page   = Math.max(1, Number(searchParams.get('page') ?? 1))
    const limit  = Math.min(500, Math.max(1, Number(searchParams.get('limit') ?? 20)))
    const search = searchParams.get('search') ?? ''
    const offset = (page - 1) * limit

    const client = await pool.connect()
    try {
      await client.query(`SET search_path TO "${tenant.schemaName}", public`)
      const conds = ['active_flg = true']
      const vals: any[] = []
      let idx = 1
      if (search) { conds.push(`LOWER(nome) LIKE $${idx++}`); vals.push(`%${search.toLowerCase()}%`) }
      const where = `WHERE ${conds.join(' AND ')}`

      const [dataRes, countRes] = await Promise.all([
        client.query(`
          SELECT produto_id, nome, unidade, tipo, estoque_atual, estoque_minimo, preco_varejo
          FROM t_produto ${where}
          ORDER BY nome ASC
          LIMIT $${idx++} OFFSET $${idx++}
        `, [...vals, limit, offset]),
        client.query(`SELECT COUNT(*)::int as total FROM t_produto ${where}`, vals),
      ])

      const total = Number(countRes.rows[0]?.total ?? 0)
      const data = dataRes.rows.map(r => ({
        produtoId:     r.produto_id,
        nome:          r.nome,
        unidade:       r.unidade,
        tipo:          r.tipo,
        estoqueAtual:  Number(r.estoque_atual ?? 0),
        estoqueMinimo: Number(r.estoque_minimo ?? 0),
        precoVarejo:   Number(r.preco_varejo ?? 0),
      }))
      return ok({ data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } })
    } finally { client.release() }
  } catch (err) { return serverError(err) }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const body   = await req.json()
    const { produtoId, quantidade } = body
    if (!produtoId || !quantidade) return serverError(new Error('Dados inválidos'))

    const client = await pool.connect()
    try {
      await client.query(`SET search_path TO "${tenant.schemaName}", public`)
      await client.query(
        `UPDATE t_produto SET estoque_atual = estoque_atual + $1, updated_dt = NOW() WHERE produto_id = $2`,
        [Number(quantidade), Number(produtoId)]
      )
      return ok({ ok: true })
    } finally { client.release() }
  } catch (err) { return serverError(err) }
}
