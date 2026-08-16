// @ts-nocheck
import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { exigirModulo } from '@/lib/auth/permissoes'
import { pool } from '@/lib/db/connection'
import { ok, serverError } from '@/lib/api/responses'
type Params = { params: { tenant: string } }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    await exigirModulo(tenant.schemaName, 'estoque')
    const { searchParams } = new URL(req.url)
    const page   = Math.max(1, Number(searchParams.get('page') ?? 1))
    const limit  = Math.min(500, Math.max(1, Number(searchParams.get('limit') ?? 20)))
    const search = searchParams.get('search') ?? ''
    const offset = (page - 1) * limit

    const client = await pool.connect()
    try {
      await client.query(`SET search_path TO "${tenant.schemaName}", public`)
      const conds = ['i.active_flg = true']
      const vals: any[] = []
      let idx = 1
      if (search) { conds.push(`LOWER(i.nome) LIKE $${idx++}`); vals.push(`%${search.toLowerCase()}%`) }
      const where = `WHERE ${conds.join(' AND ')}`

      const [dataRes, countRes] = await Promise.all([
        client.query(`
          SELECT i.insumo_id, i.nome, i.unidade, i.tipo,
                 i.estoque_atual, i.estoque_minimo, i.preco_custo,
                 COALESCE(SUM(c.quantidade), 0) as total_comprado
          FROM t_insumo i
          LEFT JOIN t_compra_insumo c ON c.insumo_id = i.insumo_id AND c.active_flg = true
          ${where}
          GROUP BY i.insumo_id, i.nome, i.unidade, i.tipo, i.estoque_atual, i.estoque_minimo, i.preco_custo
          ORDER BY i.nome ASC
          LIMIT $${idx++} OFFSET $${idx++}
        `, [...vals, limit, offset]),
        client.query(`SELECT COUNT(*)::int as total FROM t_insumo i ${where}`, vals),
      ])

      const total = Number(countRes.rows[0]?.total ?? 0)
      const data = dataRes.rows.map(r => ({
        insumoId:      r.insumo_id,
        nome:          r.nome,
        unidade:       r.unidade,
        tipo:          r.tipo,
        estoqueAtual:  Number(r.estoque_atual ?? 0),
        estoqueMinimo: Number(r.estoque_minimo ?? 0),
        precoCusto:    Number(r.preco_custo ?? 0),
        totalComprado: Number(r.total_comprado ?? 0),
      }))
      return ok({ data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } })
    } finally { client.release() }
  } catch (err) { return serverError(err) }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    await exigirModulo(tenant.schemaName, 'estoque')
    const body   = await req.json()
    const { insumoId, quantidade, precoCusto } = body
    if (!insumoId || !quantidade) return serverError(new Error('Dados inválidos'))

    const client = await pool.connect()
    try {
      await client.query(`SET search_path TO "${tenant.schemaName}", public`)
      await client.query(
        `UPDATE t_insumo SET estoque_atual = estoque_atual + $1, updated_dt = NOW() WHERE insumo_id = $2`,
        [Number(quantidade), Number(insumoId)]
      )
      if (precoCusto && Number(precoCusto) > 0) {
        await client.query(
          `UPDATE t_insumo SET preco_custo = $1, updated_dt = NOW() WHERE insumo_id = $2`,
          [Number(precoCusto), Number(insumoId)]
        )
      }
      return ok({ ok: true })
    } finally { client.release() }
  } catch (err) { return serverError(err) }
}
