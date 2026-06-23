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

      // Busca o clerkId do usuário para atualizar no Clerk também
      const [usuario] = await db
        .select({ clerkId: dbUsuario.clerkId, email: dbUsuario.email })
        .from(dbUsuario)
        .where(eq(dbUsuario.usuarioId, id))

      if (!usuario) return notFound('Usuário não encontrado')

      // Atualiza no banco local
      const updates: any = { updatedDt: new Date() }
      if (nome?.trim())  updates.nome  = nome.trim()
      if (email?.trim()) updates.email = email.trim()

      await db.update(dbUsuario).set(updates).where(eq(dbUsuario.usuarioId, id))

      // Atualiza no Clerk se o clerkId for real (não provisório pending_*)
      if (usuario.clerkId && !usuario.clerkId.startsWith('pending_')) {
        try {
          const updateData: any = {}
          if (nome?.trim()) {
            const partes = nome.trim().split(' ')
            updateData.firstName = partes[0]
            updateData.lastName  = partes.slice(1).join(' ') || undefined
          }
          await clerkClient().users.updateUser(usuario.clerkId, updateData)
        } catch {} // não bloqueia se o Clerk falhar
      }

      return ok({ atualizado: true })
    } finally {
      release()
    }
  } catch (err) {
    return serverError(err)
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const id = Number(params.id)
      const [result] = await db
        .update(dbUsuario)
        .set({ activeFlag: false, updatedDt: new Date() })
        .where(eq(dbUsuario.usuarioId, id))
        .returning({ usuarioId: dbUsuario.usuarioId })
      if (!result) return notFound('Usuário não encontrado')
      return ok({ inativado: true })
    } finally {
      release()
    }
  } catch (err) {
    return serverError(err)
  }
}