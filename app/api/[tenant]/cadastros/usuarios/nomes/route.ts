// @ts-nocheck
// ESTE ARQUIVO VAI EM: app/api/[tenant]/cadastros/usuarios/nomes/route.ts
//
// Mapa { usuarioId: nome } do tenant inteiro.
//
// Existe para o AuditoriaInfo traduzir "Criado por: 3" em "Criado por: Maria
// Julia" sem que cada tela precise fazer JOIN com t_usuario. Uma chamada,
// cacheada no cliente, serve produtos, insumos, clientes e tudo mais.
//
// Payload minúsculo (id + nome), então não há problema em trazer todos.
import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { pool } from '@/lib/db/connection'
import { ok, serverError } from '@/lib/api/responses'

type Params = { params: { tenant: string } }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const client = await pool.connect()
    try {
      await client.query(`SET search_path TO "${tenant.schemaName}", public`)

      // Inclui inativos de propósito: quem criou um registro há um ano pode
      // já ter saído da empresa, e o histórico continua sendo dele.
      const res = await client.query(`
        SELECT usuario_id, nome, email FROM t_usuario ORDER BY usuario_id
      `)

      const nomes: Record<string, string> = {}
      for (const r of res.rows) {
        nomes[String(r.usuario_id)] = r.nome?.trim() || r.email || `Usuário ${r.usuario_id}`
      }

      return ok(nomes)
    } finally {
      client.release()
    }
  } catch (err) { return serverError(err) }
}