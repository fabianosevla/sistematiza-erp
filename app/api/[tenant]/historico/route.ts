// @ts-nocheck
import type { NextRequest } from 'next/server'
import { sql } from 'drizzle-orm'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { ok, serverError } from '@/lib/api/responses'

type Params = { params: { tenant: string } }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const { searchParams } = new URL(req.url)
      const entidade   = searchParams.get('entidade')
      const entidadeId = searchParams.get('entidadeId')

      if (!entidade || !entidadeId) return ok([])

      const result = await db.execute(sql`
        SELECT
          h.historico_id,
          h.created_dt,
          h.acao,
          h.campo,
          h.valor_anterior,
          h.valor_novo,
          h.descricao,
          COALESCE(u.nome, 'Sistema') as usuario_nome
        FROM t_historico h
        LEFT JOIN t_usuario u ON u.usuario_id = h.created_by
        WHERE h.entidade = ${entidade}
          AND h.entidade_id = ${Number(entidadeId)}
        ORDER BY h.created_dt DESC
        LIMIT 50
      `)

      return ok(result.rows)
    } finally { release() }
  } catch (err) { return serverError(err) }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const { entidade, entidadeId, acao, campo, valorAnterior, valorNovo, descricao } = await req.json()

      await db.execute(sql`
        INSERT INTO t_historico (entidade, entidade_id, acao, campo, valor_anterior, valor_novo, descricao)
        VALUES (${entidade}, ${entidadeId}, ${acao}, ${campo ?? null}, ${valorAnterior ?? null}, ${valorNovo ?? null}, ${descricao ?? null})
      `)

      return ok({ ok: true })
    } finally { release() }
  } catch (err) { return serverError(err) }
}