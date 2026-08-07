// @ts-nocheck
// ESTE ARQUIVO VAI EM: app/api/[tenant]/cadastros/usuarios/[id]/route.ts
import type { NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { pool } from '@/lib/db/connection'
import { usuarioAtualIdDb } from '@/lib/auth/usuarioAtual'
import { dbUsuario } from '@/lib/db/schemas/cadastros'
import { atualizarNome, removerConta, ehProvisorio } from '@/lib/auth/identidade'
import { ok, serverError, notFound, badRequest } from '@/lib/api/responses'

type Params = { params: { tenant: string; id: string } }

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const body   = await req.json()
    const { nome, email, perfilId } = body
    if (!nome?.trim() && !email?.trim() && perfilId === undefined) return badRequest('Nenhum campo para atualizar')
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const id = Number(params.id)
      const [usuario] = await db
        .select({ clerkId: dbUsuario.clerkId, email: dbUsuario.email })
        .from(dbUsuario)
        .where(eq(dbUsuario.usuarioId, id))
      if (!usuario) return notFound('Usuário não encontrado')

      // Quem está alterando. Antes o updated_by nem era tocado aqui.
      const uid = await usuarioAtualIdDb(db)

      const updates: any = { updatedDt: new Date(), updatedBy: uid }
      if (nome?.trim())        updates.nome    = nome.trim()
      if (email?.trim())       updates.email   = email.trim()
      if (perfilId !== undefined) updates.perfilId = perfilId
      await db.update(dbUsuario).set(updates).where(eq(dbUsuario.usuarioId, id))
      if (usuario.clerkId && !ehProvisorio(usuario.clerkId) && nome?.trim()) {
        // Best-effort: o nome do sistema e o que vale. Se o provedor de
        // identidade estiver fora do ar, o cadastro nao pode falhar por isso.
        try { await atualizarNome(usuario.clerkId, nome.trim()) } catch {}
      }
      return ok({ atualizado: true })
    } finally { release() }
  } catch (err) { return serverError(err) }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const id = Number(params.id)
      const [usuario] = await db
        .select({ clerkId: dbUsuario.clerkId, nome: dbUsuario.nome, email: dbUsuario.email })
        .from(dbUsuario)
        .where(eq(dbUsuario.usuarioId, id))
      if (!usuario) return notFound('Usuário não encontrado')

      // 1. Preserva o nome do vendedor nas vendas antes de excluir
      // A coluna "vendedor" em t_venda já é string — não precisa fazer nada
      // mas garantimos que as vendas com usuarioId apontem para o nome do usuário
      if (tenant.schemaName) {
        const client = await pool.connect()
        try {
          await client.query(`SET search_path TO "${tenant.schemaName}", public`)
          // Se a coluna vendedor for FK, converte para string antes de deletar
          await client.query(
            `UPDATE t_venda SET vendedor = $1 WHERE vendedor = $2::text`,
            [usuario.nome, String(id)]
          )
        } catch (_) {
          // ignora se a coluna já é string
        } finally {
          client.release()
        }
      }

      // 2. Deleta do Clerk
      if (usuario.clerkId && !ehProvisorio(usuario.clerkId)) {
        try {
          await removerConta(usuario.clerkId)
        } catch (clerkErr: any) {
          const msg = clerkErr?.errors?.[0]?.message ?? ''
          if (!msg.includes('not found') && !msg.includes('does not exist')) {
            return serverError(new Error('Erro ao deletar usuário do Clerk: ' + msg))
          }
        }
      }

      // 3. Remove do banco local
      await db.delete(dbUsuario).where(eq(dbUsuario.usuarioId, id))

      return ok({ deletado: true, nome: usuario.nome })
    } finally { release() }
  } catch (err) { return serverError(err) }
}