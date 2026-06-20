// app/api/[tenant]/cadastros/usuarios/[id]/perfil/route.ts
//
// Rota ADITIVA e isolada — não toca no fluxo existente de criação/convite
// de usuário via Clerk. Só vincula/troca o perfil de acesso (t_perfil_acesso)
// de um usuário já existente, via raw SQL direto (mesmo padrão usado em
// configuracoes/route.ts).
import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { pool } from '@/lib/db/connection'
import { ok, serverError } from '@/lib/api/responses'

type P = { params: { tenant: string; id: string } }

export async function PUT(req: NextRequest, { params }: P) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { perfilId } = await req.json()
    const client = await pool.connect()
    try {
      await client.query(`SET search_path TO "${tenant.schemaName}", public`)

      // Busca se o perfil selecionado é admin, pra manter o campo legado
      // 'perfil' (varchar 'admin'/'user') sincronizado — outras partes do
      // sistema ainda fazem fallback nesse campo quando perfil_id é nulo.
      const perfilRes = await client.query(
        `SELECT is_admin FROM t_perfil_acesso WHERE perfil_id = $1`,
        [perfilId]
      )
      const isAdmin = perfilRes.rows[0]?.is_admin ?? false

      await client.query(
        `UPDATE t_usuario SET perfil_id = $1, perfil = $2 WHERE usuario_id = $3`,
        [perfilId, isAdmin ? 'admin' : 'user', Number(params.id)]
      )

      return ok({ updated: true })
    } finally { client.release() }
  } catch (err) { return serverError(err) }
}