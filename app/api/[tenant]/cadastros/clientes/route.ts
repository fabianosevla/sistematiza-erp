// @ts-nocheck
// app/api/[tenant]/cadastros/clientes/route.ts
//
// Reescrito com pool + SET search_path (mesmo padrão de produtos e insumos).
// A versão anterior usava getDbForTenant + Drizzle e retornava vazio na busca,
// quebrando a combobox de cliente no PDV e nas Vendas.
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
    const limit  = Math.min(1000, Math.max(1, Number(searchParams.get('limit') ?? 500)))
    const search = searchParams.get('search') ?? ''
    const offset = (page - 1) * limit

    const client = await pool.connect()
    try {
      await client.query(`SET search_path TO "${tenant.schemaName}", public`)

      const conditions = ['active_flg = true']
      const values: any[] = []
      let idx = 1

      if (search) {
        // Busca por nome OU documento (CPF/CNPJ)
        conditions.push(`(LOWER(nome_completo) LIKE $${idx} OR LOWER(COALESCE(documento, '')) LIKE $${idx})`)
        values.push(`%${search.toLowerCase()}%`)
        idx++
      }

      const where = `WHERE ${conditions.join(' AND ')}`

      const [dataRes, countRes] = await Promise.all([
        client.query(`
          SELECT cliente_id, tipo_pessoa, nome_completo, nome_fantasia, documento,
                 email, telefone, celular, cep, endereco, numero, complemento,
                 bairro, cidade, uf, observacao,
                 active_flg, modification_num, created_dt, created_by, updated_dt, updated_by
          FROM t_cliente ${where}
          ORDER BY nome_completo ASC
          LIMIT $${idx++} OFFSET $${idx++}
        `, [...values, limit, offset]),
        client.query(`SELECT COUNT(*)::int as total FROM t_cliente ${where}`, values),
      ])

      const total      = Number(countRes.rows[0]?.total ?? 0)
      const totalPages = Math.ceil(total / limit)

      const data = dataRes.rows.map(r => ({
        clienteId:       r.cliente_id,
        tipoPessoa:      r.tipo_pessoa,
        nomeCompleto:    r.nome_completo,
        nomeFantasia:    r.nome_fantasia,
        documento:       r.documento,
        cpfCnpj:         r.documento,   // alias p/ compat. com PDV / Pedidos
        email:           r.email,
        telefone:        r.telefone,
        celular:         r.celular,
        cep:             r.cep,
        endereco:        r.endereco,
        numero:          r.numero,
        complemento:     r.complemento,
        bairro:          r.bairro,
        cidade:          r.cidade,
        uf:              r.uf,
        observacao:      r.observacao,
        activeFlag:      r.active_flg,
        modificationNum: r.modification_num,
        createdDt:       r.created_dt,
        createdBy:       r.created_by,
        updatedDt:       r.updated_dt,
        updatedBy:       r.updated_by,
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
    if (!body.nomeCompleto?.trim()) return badRequest('Nome é obrigatório')

    const client = await pool.connect()
    try {
      await client.query(`SET search_path TO "${tenant.schemaName}", public`)
      const res = await client.query(`
        INSERT INTO t_cliente (
          tipo_pessoa, nome_completo, nome_fantasia, documento, email, telefone, celular,
          cep, endereco, numero, complemento, bairro, cidade, uf, observacao,
          active_flg, modification_num, created_by, updated_by, created_dt, updated_dt
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,true,0,1,1,NOW(),NOW())
        RETURNING cliente_id as "clienteId"
      `, [
        body.tipoPessoa?.trim() || 'PF',
        body.nomeCompleto.trim(),
        body.nomeFantasia?.trim() || null,
        body.documento?.trim() || null,
        body.email?.trim() || null,
        body.telefone?.trim() || null,
        body.celular?.trim() || null,
        body.cep?.trim() || null,
        body.endereco?.trim() || null,
        body.numero?.trim() || null,
        body.complemento?.trim() || null,
        body.bairro?.trim() || null,
        body.cidade?.trim() || null,
        body.uf?.trim()?.toUpperCase().slice(0, 2) || null,
        body.observacao?.trim() || null,
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