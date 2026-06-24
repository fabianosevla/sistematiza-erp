import type { NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { dbUsuario } from '@/lib/db/schemas/cadastros'
import { clerkClient } from '@clerk/nextjs/server'
import { ok, serverError, notFound, badRequest } from '@/lib/api/responses'

type Params = { params: { tenant: string; id: string } }

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const body   = await req.json()
    const { nome, email } = body
    if (!nome?.trim() && !email?.trim()) return badRequest('Nenhum campo para atualizar')
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const id = Number(params.id)
      const [usuario] = await db
        .select({ clerkId: dbUsuario.clerkId, email: dbUsuario.email })
        .from(dbUsuario)
        .where(eq(dbUsuario.usuarioId, id))
      if (!usuario) return notFound('Usuário não encontrado')
      const updates: any = { updatedDt: new Date() }
      if (nome?.trim())  updates.nome  = nome.trim()
      if (email?.trim()) updates.email = email.trim()
      await db.update(dbUsuario).set(updates).where(eq(dbUsuario.usuarioId, id))
      if (usuario.clerkId && !usuario.clerkId.startsWith('pending_')) {
        try {
          const updateData: any = {}
          if (nome?.trim()) {
            const partes = nome.trim().split(' ')
            updateData.firstName = partes[0]
            updateData.lastName  = partes.slice(1).join(' ') || undefined
          }
          await clerkClient().users.updateUser(usuario.clerkId, updateData)
        } catch {}
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

      // Busca clerkId antes de deletar
      const [usuario] = await db
        .select({ clerkId: dbUsuario.clerkId, nome: dbUsuario.nome })
        .from(dbUsuario)
        .where(eq(dbUsuario.usuarioId, id))
      if (!usuario) return notFound('Usuário não encontrado')

      // 1. Deleta do Clerk (bloqueia login imediatamente)
      if (usuario.clerkId && !usuario.clerkId.startsWith('pending_')) {
        try {
          await clerkClient().users.deleteUser(usuario.clerkId)
        } catch (clerkErr: any) {
          // Se o usuário não existe mais no Clerk, continua deletando do banco
          const msg = clerkErr?.errors?.[0]?.message ?? ''
          if (!msg.includes('not found') && !msg.includes('does not exist')) {
            return serverError(new Error('Erro ao deletar usuário do Clerk: ' + msg))
          }
        }
      }

      // 2. Remove do banco local (hard delete — não é soft delete)
      await db.delete(dbUsuario).where(eq(dbUsuario.usuarioId, id))

      return ok({ deletado: true, nome: usuario.nome })
    } finally { release() }
  } catch (err) { return serverError(err) }
}