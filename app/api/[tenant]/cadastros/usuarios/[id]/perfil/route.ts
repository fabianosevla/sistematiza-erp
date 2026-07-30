// ESTE ARQUIVO VAI EM: app/api/[tenant]/cadastros/usuarios/[id]/perfil/route.ts
import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { pool } from '@/lib/db/connection'
import { usuarioAtualId } from '@/lib/auth/usuarioAtual'
import { ok, serverError } from '@/lib/api/responses'

type P = { params: { tenant: string; id: string } }

export async function PUT(req: NextRequest, { params }: P) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { perfilId } = await req.json()
    const client = await pool.connect()
    try {
      await client.query(`SET search_path TO "${tenant.schemaName}", public`)

      // Trocar o perfil de alguém é a alteração mais sensível deste cadastro:
      // muda o que a pessoa enxerga no sistema. Fica registrado quem fez.
      const uid = await usuarioAtualId(client)

      const perfilRes = await client.query(
        `SELECT is_admin FROM t_perfil_acesso WHERE perfil_id = $1`,
        [perfilId]
      )
      const isAdmin = perfilRes.rows[0]?.is_admin ?? false
      await client.query(
        `UPDATE t_usuario
            SET perfil_id = $1, perfil = $2, updated_dt = NOW(), updated_by = $4
          WHERE usuario_id = $3`,
        [perfilId, isAdmin ? 'admin' : 'user', Number(params.id), uid]
      )
      return ok({ updated: true })
    } finally { client.release() }
  } catch (err) { return serverError(err) }
}