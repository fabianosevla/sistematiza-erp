// @ts-nocheck
// app/api/[tenant]/estoque/ajustar/route.ts
//
// Reescrito com pool + SET search_path e agora com paginação + busca.
// GET retorna { data, meta } no mesmo formato de produtos/insumos.
import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { exigirModulo } from '@/lib/auth/permissoes'
import { pool } from '@/lib/db/connection'
import { usuarioAtualId } from '@/lib/auth/usuarioAtual'
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

/**
 * AJUSTE MANUAL DE ESTOQUE.
 *
 * Antes esta rota só fazia `UPDATE t_produto SET estoque_atual = X` e ia
 * embora. O saldo mudava e não sobrava rastro nenhum: nem linha em
 * t_movimentacao_estoque, nem quem mexeu, nem quando. Na prática, alguém
 * podia corrigir 500 unidades para 50 e nada no sistema saberia dizer o que
 * aconteceu — inclusive a consulta de "Entrada de estoque por período" não
 * enxergava esse aumento.
 *
 * Agora o ajuste grava a movimentação correspondente à DIFERENÇA:
 *   saldo subiu  → 'entrada' com a diferença positiva
 *   saldo desceu → 'saida'   com a diferença
 *   sem mudança  → não grava linha nenhuma
 *
 * Gravar a diferença, e não o valor final, é o que faz esta linha somar
 * corretamente com as outras entradas no relatório. Se registrasse o saldo
 * final, "ajustei de 40 para 50" entraria no período como uma entrada de 50.
 */
export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    await exigirModulo(tenant.schemaName, 'estoque')
    const { produtoId, novoEstoque, observacao } = await req.json()

    const client = await pool.connect()
    try {
      await client.query(`SET search_path TO "${tenant.schemaName}", public`)
      const userId = await usuarioAtualId(client)

      const id    = Number(produtoId)
      const novo  = Number(novoEstoque)

      const atualRes = await client.query(
        `SELECT estoque_atual FROM t_produto WHERE produto_id = $1`, [id]
      )
      const anterior = Number(atualRes.rows[0]?.estoque_atual ?? 0)
      const delta    = novo - anterior

      await client.query('BEGIN')
      try {
        await client.query(
          `UPDATE t_produto SET estoque_atual = $1, updated_dt = NOW(), updated_by = $2 WHERE produto_id = $3`,
          [novo, userId, id]
        )

        if (delta !== 0) {
          await client.query(`
            INSERT INTO t_movimentacao_estoque
              (tipo, entidade, entidade_id, quantidade, preco_custo, observacao,
               data_movimentacao, created_by, updated_by, created_dt, updated_dt, active_flg, modification_num)
            VALUES ($1, 'produto', $2, $3, 0, $4, NOW(), $5, $5, NOW(), NOW(), true, 0)
          `, [
            delta > 0 ? 'entrada' : 'saida',
            id,
            Math.abs(delta),
            observacao?.trim() || `Ajuste manual: ${anterior} → ${novo}`,
            userId,
          ])
        }

        await client.query('COMMIT')
      } catch (e) {
        await client.query('ROLLBACK')
        throw e
      }

      return ok({ ok: true, anterior, novo, delta })
    } finally {
      client.release()
    }
  } catch (err) { return serverError(err) }
}