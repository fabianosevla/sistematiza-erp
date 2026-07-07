const fs = require('fs')

const novaRota = `// @ts-nocheck
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
    const offset = (page - 1) * limit

    const client = await pool.connect()
    try {
      await client.query(\`SET search_path TO "\${tenant.schemaName}", public\`)

      const conditions = ['active_flg = true']
      const values: any[] = []
      let idx = 1

      if (search) {
        conditions.push(\`LOWER(nome) LIKE $\${idx++}\`)
        values.push(\`%\${search.toLowerCase()}%\`)
      }

      const where = \`WHERE \${conditions.join(' AND ')}\`

      const [dataRes, countRes] = await Promise.all([
        client.query(\`
          SELECT insumo_id, nome, descricao, codigo_barras, unidade, tipo,
                 estoque_atual, estoque_minimo, preco_custo, fornecedor_id,
                 active_flg, modification_num, created_dt, updated_dt
          FROM t_insumo \${where}
          ORDER BY nome ASC
          LIMIT $\${idx++} OFFSET $\${idx++}
        \`, [...values, limit, offset]),
        client.query(\`SELECT COUNT(*)::int as total FROM t_insumo \${where}\`, values),
      ])

      const total      = Number(countRes.rows[0]?.total ?? 0)
      const totalPages = Math.ceil(total / limit)

      const data = dataRes.rows.map(r => ({
        insumoId:       r.insumo_id,
        nome:           r.nome,
        descricao:      r.descricao,
        codigoBarras:   r.codigo_barras,
        unidade:        r.unidade,
        tipo:           r.tipo,
        estoqueAtual:   Number(r.estoque_atual ?? 0),
        estoqueMinimo:  Number(r.estoque_minimo ?? 0),
        precoCusto:     Number(r.preco_custo ?? 0),
        fornecedorId:   r.fornecedor_id,
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
      await client.query(\`SET search_path TO "\${tenant.schemaName}", public\`)
      const res = await client.query(\`
        INSERT INTO t_insumo (
          nome, descricao, codigo_barras, unidade, tipo,
          estoque_atual, estoque_minimo, preco_custo,
          active_flg, modification_num, created_by, updated_by, created_dt, updated_dt
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,0,1,1,NOW(),NOW())
        RETURNING insumo_id as "insumoId"
      \`, [
        body.nome.trim(),
        body.descricao?.trim() || null,
        body.codigoBarras?.trim() || null,
        body.unidade?.trim() || 'kg',
        body.tipo?.trim() || null,
        Number(body.estoqueAtual ?? 0),
        Number(body.estoqueMinimo ?? 0),
        Number(body.precoCusto ?? 0),
      ])
      return created(res.rows[0])
    } finally {
      client.release()
    }
  } catch (err: any) {
    if (err?.code === '23505') return serverError({ code: '23505' })
    return serverError(err)
  }
}
`

fs.writeFileSync('app/api/[tenant]/cadastros/insumos/route.ts', novaRota, 'utf8')
console.log('OK: rota insumos reescrita com pool+search_path e paginacao correta')