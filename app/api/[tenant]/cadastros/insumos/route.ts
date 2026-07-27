// @ts-nocheck
// ESTE ARQUIVO VAI EM: app/api/[tenant]/cadastros/insumos/route.ts
//
// GET aceita ?incluirProdutos=true — quando ligado, faz UNION dos produtos
// marcados como insumo (insumo_flg=true), que aparecem com insumoId negativo
// (= -produto_id). A tela de cadastro de Insumos NÃO passa esse parâmetro
// (continua só com insumos reais e editáveis); os dropdowns de Ficha Técnica
// passam, pra deixar o produto-insumo selecionável.
//
// CORREÇÃO: para o produto-insumo, o preco_custo vem SEMPRE do custo de
// produção dele (soma da própria ficha técnica) quando ele TEM ficha. O
// preco_custo manual do cadastro só é usado se o produto não tiver ficha.
// Antes o manual tinha prioridade — um valor antigo (ex.: molho a 20,77 no
// cadastro) travava o custo, mesmo com a ficha calculando 26,27.
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
    const incluirProdutos = searchParams.get('incluirProdutos') === 'true'
    const offset = (page - 1) * limit

    const client = await pool.connect()
    try {
      await client.query(`SET search_path TO "${tenant.schemaName}", public`)

      // Fonte base: insumos reais. Se pedido, UNION com produtos-insumo (id negativo).
      // Para o produto-insumo, o custo é o custo de produção dele (ficha técnica,
      // se existir); só cai no custo manual do cadastro se não houver ficha.
      const fonte = incluirProdutos
        ? `(
            SELECT insumo_id AS id, nome, descricao, codigo_barras, unidade, tipo,
                   estoque_atual::numeric AS estoque_atual, estoque_minimo::numeric AS estoque_minimo,
                   preco_custo, fornecedor_id, 'insumo'::text AS origem
            FROM t_insumo WHERE active_flg = true
            UNION ALL
            SELECT (-p.produto_id) AS id, p.nome, p.descricao, p.codigo_barras, p.unidade, 'Produto'::varchar AS tipo,
                   p.estoque_atual::numeric AS estoque_atual, p.estoque_minimo::numeric AS estoque_minimo,
                   COALESCE((
                     SELECT ROUND(SUM(pi.quantidade * COALESCE(i2.preco_custo, p2.preco_custo, 0)))::integer
                     FROM t_produto_insumo pi
                     LEFT JOIN t_insumo  i2 ON i2.insumo_id = pi.insumo_id     AND pi.insumo_id > 0 AND i2.active_flg = true
                     LEFT JOIN t_produto p2 ON (-pi.insumo_id) = p2.produto_id AND pi.insumo_id < 0 AND p2.active_flg = true
                     WHERE pi.produto_id = p.produto_id AND pi.active_flg = true
                   ), p.preco_custo, 0) AS preco_custo,
                   NULL::integer AS fornecedor_id, 'produto'::text AS origem
            FROM t_produto p WHERE p.active_flg = true AND p.insumo_flg = true
          )`
        : `(
            SELECT insumo_id AS id, nome, descricao, codigo_barras, unidade, tipo,
                   estoque_atual::numeric AS estoque_atual, estoque_minimo::numeric AS estoque_minimo,
                   preco_custo, fornecedor_id, 'insumo'::text AS origem
            FROM t_insumo WHERE active_flg = true
          )`

      const vals: any[] = []
      let idx = 1
      let searchClause = ''
      if (search) { searchClause = `WHERE LOWER(nome) LIKE $${idx++}`; vals.push(`%${search.toLowerCase()}%`) }

      const [dataRes, countRes] = await Promise.all([
        client.query(`
          SELECT * FROM ${fonte} c
          ${searchClause}
          ORDER BY nome ASC
          LIMIT $${idx++} OFFSET $${idx++}
        `, [...vals, limit, offset]),
        client.query(`SELECT COUNT(*)::int AS total FROM ${fonte} c ${searchClause}`, vals),
      ])

      const total      = Number(countRes.rows[0]?.total ?? 0)
      const totalPages = Math.ceil(total / limit)

      const data = dataRes.rows.map(r => ({
        insumoId:       r.id,                                   // negativo = produto-insumo
        produtoId:      r.origem === 'produto' ? -r.id : null,
        origem:         r.origem,
        nome:           r.nome,
        descricao:      r.descricao,
        codigoBarras:   r.codigo_barras,
        unidade:        r.unidade,
        tipo:           r.tipo,
        estoqueAtual:   Number(r.estoque_atual ?? 0),
        estoqueMinimo:  Number(r.estoque_minimo ?? 0),
        precoCusto:     Number(r.preco_custo ?? 0),
        fornecedorId:   r.fornecedor_id,
        activeFlag:     true,
        modificationNum: 0,
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

      // Impede cadastro duplicado: chave = nome (insumo ativo).
      const dup = await client.query(
        `SELECT insumo_id FROM t_insumo
         WHERE active_flg = true AND LOWER(nome) = LOWER($1) LIMIT 1`,
        [body.nome.trim()]
      )
      if (dup.rows.length > 0) return badRequest('Registro já existente')

      const res = await client.query(`
        INSERT INTO t_insumo (
          nome, descricao, codigo_barras, unidade, tipo,
          estoque_atual, estoque_minimo, preco_custo, fornecedor_id,
          active_flg, modification_num, created_by, updated_by, created_dt, updated_dt
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,0,1,1,NOW(),NOW())
        RETURNING insumo_id as "insumoId"
      `, [
        body.nome.trim(),
        body.descricao?.trim() || null,
        body.codigoBarras?.trim() || null,
        body.unidade?.trim() || 'kg',
        body.tipo?.trim() || null,
        Number(body.estoqueAtual ?? 0),
        Number(body.estoqueMinimo ?? 0),
        Number(body.precoCusto ?? 0),
        body.fornecedorId ? Number(body.fornecedorId) : null,
      ])
      return created(res.rows[0])
    } finally {
      client.release()
    }
  } catch (err: any) {
    if (err?.code === '23505') return badRequest('Registro já existente')
    return serverError(err)
  }
}