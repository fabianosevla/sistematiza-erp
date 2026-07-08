// @ts-nocheck
// app/api/[tenant]/estoque/ajustar/route.ts
//
// Reescrito com pool + SET search_path e agora com paginação + busca.
// GET retorna { data, meta } no mesmo formato de produtos/insumos.
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

      const conds: string[] = ['active_flg = true']
      const vals: any[] = []
      let idx = 1
      if (search) { conds.push(`LOWER(nome) LIKE $${idx++}`); vals.push(`%${search.toLowerCase()}%`) }
      const where = `WHERE ${conds.join(' AND ')}`

      const [dataRes, countRes] = await Promise.all([
        client.query(`
          SELECT produto_id, nome, estoque_atual, estoque_minimo, unidade
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
        estoqueAtual:  Number(r.estoque_atual ?? 0),
        estoqueMinimo: Number(r.estoque_minimo ?? 0),
        unidade:       r.unidade,
      }))

      return ok({ data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } })
    } finally {
      client.release()
    }
  } catch (err) { return serverError(err) }
}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { produtoId, novoEstoque } = await req.json()

    const client = await pool.connect()
    try {
      await client.query(`SET search_path TO "${tenant.schemaName}", public`)
      await client.query(
        `UPDATE t_produto SET estoque_atual = $1, updated_dt = NOW() WHERE produto_id = $2`,
        [Number(novoEstoque), Number(produtoId)]
      )
      return ok({ ok: true })
    } finally {
      client.release()
    }
  } catch (err) { return serverError(err) }
}