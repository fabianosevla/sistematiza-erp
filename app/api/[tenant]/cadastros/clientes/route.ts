// @ts-nocheck
// app/api/[tenant]/cadastros/clientes/route.ts
//
// Reescrito com pool + SET search_path (mesmo padrão de produtos e insumos).
// A versão anterior usava getDbForTenant + Drizzle e retornava vazio na busca,
// quebrando a combobox de cliente no PDV e nas Vendas.
import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { pool } from '@/lib/db/connection'
import { usuarioAtualId } from '@/lib/auth/usuarioAtual'
import { ok, created, serverError, badRequest } from '@/lib/api/responses'

type Params = { params: { tenant: string } }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { searchParams } = new URL(req.url)
    const page   = Math.max(1, Number(searchParams.get('page') ?? 1))
    const limit  = Math.min(1000, Math.max(1, Number(searchParams.get('limit') ?? 500)))
    const search = searchParams.get('search') ?? ''
    const incluirInativos = searchParams.get('incluirInativos') === 'true'
    const offset = (page - 1) * limit

    const client = await pool.connect()
    try {
      await client.query(`SET search_path TO "${tenant.schemaName}", public`)

      const conditions: string[] = []
      const values: any[] = []
      let idx = 1

      // Por padrão, só clientes ativos. ?incluirInativos=true traz todos.
      if (!incluirInativos) conditions.push('active_flg = true')

      if (search) {
        // Busca por nome OU documento (CPF/CNPJ)
        // Busca também pelo nome fantasia — é o nome que aparece na listagem,
        // então procurar por ele tem que funcionar.
        conditions.push(`(LOWER(nome_completo) LIKE $${idx} OR LOWER(COALESCE(nome_fantasia, '')) LIKE $${idx} OR LOWER(COALESCE(documento, '')) LIKE $${idx})`)
        values.push(`%${search.toLowerCase()}%`)
        idx++
      }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

      const [dataRes, countRes] = await Promise.all([
        client.query(`
          SELECT cliente_id, tipo_pessoa, nome_completo, nome_fantasia, documento,
                 email, telefone, celular, cep, endereco, numero, complemento,
                 bairro, cidade, uf, observacao, tabela_preco,
                 -- Fiscal: a NF-e precisa saber se o comprador e contribuinte.
                 inscricao_estadual, indicador_ie,
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
        // Tabela de preço do cliente — o PDV usa para escolher varejo/atacado
        tabelaPreco:     r.tabela_preco ?? 'varejo',
        inscricaoEstadual: r.inscricao_estadual ?? '',
        // 1 contribuinte · 2 isento · 9 nao contribuinte
        indicadorIe:       r.indicador_ie ?? '9',
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

    // CONTATO OBRIGATÓRIO NO CADASTRO NOVO.
    // Vale só aqui, no POST. O PUT (edição) não checa, para que um cliente
    // antigo sem telefone continue podendo ser corrigido e salvo.
    // Aceita celular ou telefone — um dos dois basta.
    const temContato = (body.telefone?.trim() || body.celular?.trim())
    if (!temContato) return badRequest('Informe telefone ou celular')

    const client = await pool.connect()
    try {
      await client.query(`SET search_path TO "${tenant.schemaName}", public`)

      // Quem está cadastrando. Antes era o literal 1 dentro do SQL.
      const uid = await usuarioAtualId(client)

      // Impede cadastro duplicado: chave = documento (CPF/CNPJ), comparando só dígitos.
      const doc = body.documento?.trim() || null
      if (doc) {
        const dup = await client.query(
          `SELECT cliente_id FROM t_cliente
           WHERE active_flg = true
             AND REGEXP_REPLACE(COALESCE(documento,''), '[^0-9]', '', 'g') = REGEXP_REPLACE($1, '[^0-9]', '', 'g')
             AND REGEXP_REPLACE($1, '[^0-9]', '', 'g') <> ''
           LIMIT 1`,
          [doc]
        )
        if (dup.rows.length > 0) return badRequest('Registro já existente')
      }

      const res = await client.query(`
        INSERT INTO t_cliente (
          tipo_pessoa, nome_completo, nome_fantasia, documento, email, telefone, celular,
          cep, endereco, numero, complemento, bairro, cidade, uf, observacao, tabela_preco,
          inscricao_estadual, indicador_ie,
          active_flg, modification_num, created_by, updated_by, created_dt, updated_dt
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,true,0,$19,$19,NOW(),NOW())
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
        // Valor fora da lista vira 'varejo' — nunca grava lixo na coluna
        (['varejo','atacado_a','atacado_b','atacado_c','atacado_d','atacado_e']
          .includes(String(body.tabelaPreco)) ? body.tabelaPreco : 'varejo'),
        body.inscricaoEstadual?.trim() || null,
        (['1','2','9'].includes(String(body.indicadorIe)) ? body.indicadorIe : '9'),
        uid,
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

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { searchParams } = new URL(req.url)
    const id = Number(searchParams.get('id'))
    if (!id) return badRequest('ID do cliente é obrigatório')

    const client = await pool.connect()
    try {
      await client.query(`SET search_path TO "${tenant.schemaName}", public`)

      // Inativar é uma alteração: quem inativou tem que ficar registrado.
      const uid = await usuarioAtualId(client)

      // Está associado a alguma venda ou pedido? Se sim, só inativa (preserva histórico).
      let associado = false
      const vend = await client
        .query(`SELECT 1 FROM t_venda WHERE cliente_id = $1 LIMIT 1`, [id])
        .catch(() => ({ rows: [] as any[] }))
      if (vend.rows.length > 0) associado = true

      if (!associado) {
        const ped = await client
          .query(`SELECT 1 FROM t_pedido WHERE cliente_id = $1 LIMIT 1`, [id])
          .catch(() => ({ rows: [] as any[] }))
        if (ped.rows.length > 0) associado = true
      }

      if (associado) {
        await client.query(
          `UPDATE t_cliente SET active_flg = false, updated_dt = NOW(), updated_by = $2 WHERE cliente_id = $1`,
          [id, uid]
        )
        return ok({ inativado: true, message: 'Cliente inativado — possui vendas associadas, histórico preservado.' })
      }

      // Sem vínculo: exclui de fato. Se ainda houver FK inesperada, cai no fallback de inativar.
      try {
        await client.query(`DELETE FROM t_cliente WHERE cliente_id = $1`, [id])
        return ok({ deletado: true, message: 'Cliente excluído.' })
      } catch (e: any) {
        if (e?.code === '23503') {
          await client.query(
            `UPDATE t_cliente SET active_flg = false, updated_dt = NOW() WHERE cliente_id = $1`,
            [id]
          )
          return ok({ inativado: true, message: 'Cliente inativado — possui registros associados.' })
        }
        throw e
      }
    } finally {
      client.release()
    }
  } catch (err) { return serverError(err) }
}