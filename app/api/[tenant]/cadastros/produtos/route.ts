// @ts-nocheck
import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { pool } from '@/lib/db/connection'
import { ok, created, serverError, badRequest } from '@/lib/api/responses'

type Params = { params: { tenant: string } }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { searchParams } = new URL(req.url)
    const page   = Math.max(1, Number(searchParams.get('page') ?? 1))
    const limit  = Math.min(500, Math.max(1, Number(searchParams.get('limit') ?? 20)))
    const search = searchParams.get('search') ?? ''
    const incluirInativos = searchParams.get('incluirInativos') === 'true'
    const offset = (page - 1) * limit

    const client = await pool.connect()
    try {
      await client.query(`SET search_path TO "${tenant.schemaName}", public`)

      const conditions = []
      const values: any[] = []
      let idx = 1

      if (!incluirInativos) {
        conditions.push(`active_flg = true`)
      }
      if (search) {
        conditions.push(`LOWER(nome) LIKE $${idx++}`)
        values.push(`%${search.toLowerCase()}%`)
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

      const [dataRes, countRes] = await Promise.all([
        client.query(`
          SELECT produto_id, nome, descricao, codigo_barras, unidade, tipo, categoria,
                 estoque_atual, estoque_minimo, preco_custo, preco_varejo,
                 preco_atacado_a, preco_atacado_b, preco_atacado_c, preco_atacado_d, preco_atacado_e,
                 insumo_flg, active_flg, modification_num, created_dt, updated_dt
          FROM t_produto ${where}
          ORDER BY nome ASC
          LIMIT $${idx++} OFFSET $${idx++}
        `, [...values, limit, offset]),
        client.query(`SELECT COUNT(*)::int as total FROM t_produto ${where}`, values),
      ])

      const total      = Number(countRes.rows[0]?.total ?? 0)
      const totalPages = Math.ceil(total / limit)

      const data = dataRes.rows.map(r => ({
        produtoId:      r.produto_id,
        nome:           r.nome,
        descricao:      r.descricao,
        codigoBarras:   r.codigo_barras,
        unidade:        r.unidade,
        tipo:           r.tipo,
        categoria:      r.categoria,
        estoqueAtual:   Number(r.estoque_atual ?? 0),
        estoqueMinimo:  Number(r.estoque_minimo ?? 0),
        precoCusto:     Number(r.preco_custo ?? 0),
        precoVarejo:    Number(r.preco_varejo ?? 0),
        precoAtacadoA:  Number(r.preco_atacado_a ?? 0),
        precoAtacadoB:  Number(r.preco_atacado_b ?? 0),
        precoAtacadoC:  Number(r.preco_atacado_c ?? 0),
        precoAtacadoD:  Number(r.preco_atacado_d ?? 0),
        precoAtacadoE:  Number(r.preco_atacado_e ?? 0),
        insumoFlg:      r.insumo_flg === true,
        activeFlag:     r.active_flg,
        modificationNum: r.modification_num,
      }))

      return ok({ data, meta: { total, page, limit, totalPages } })
    } finally {
      client.release()
    }
  } catch (err) { return serverError(err) }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const body   = await req.json()
    if (!body.nome?.trim()) return badRequest('Nome é obrigatório')

    const client = await pool.connect()
    try {
      await client.query(`SET search_path TO "${tenant.schemaName}", public`)

      // Impede cadastro duplicado: chave = nome (produto ativo).
      const dup = await client.query(
        `SELECT produto_id FROM t_produto
         WHERE active_flg = true AND LOWER(nome) = LOWER($1) LIMIT 1`,
        [body.nome.trim()]
      )
      if (dup.rows.length > 0) return badRequest('Produto já existente')

      const res = await client.query(`
        INSERT INTO t_produto (
          nome, descricao, codigo_barras, unidade, tipo, categoria,
          estoque_atual, estoque_minimo, preco_custo, preco_varejo,
          preco_atacado_a, preco_atacado_b, preco_atacado_c, preco_atacado_d, preco_atacado_e,
          insumo_flg, active_flg, modification_num, created_by, updated_by, created_dt, updated_dt
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,true,0,1,1,NOW(),NOW())
        RETURNING produto_id as "produtoId"
      `, [
        body.nome.trim(),
        body.descricao?.trim() || null,
        body.codigoBarras?.trim() || null,
        body.unidade?.trim() || 'un',
        body.tipo?.trim() || null,
        body.categoria?.trim() || null,
        Number(body.estoqueAtual ?? 0),
        Number(body.estoqueMinimo ?? 0),
        Number(body.precoCusto ?? 0),
        Number(body.precoVarejo ?? 0),
        Number(body.precoAtacadoA ?? body.precoAtacado ?? 0),
        Number(body.precoAtacadoB ?? 0),
        Number(body.precoAtacadoC ?? 0),
        Number(body.precoAtacadoD ?? 0),
        Number(body.precoAtacadoE ?? 0),
        body.insumoFlg === true,
      ])
      return created(res.rows[0])
    } finally {
      client.release()
    }
  } catch (err: any) {
    if (err?.code === '23505') return badRequest('Produto já existente')
    return serverError(err)
  }
}