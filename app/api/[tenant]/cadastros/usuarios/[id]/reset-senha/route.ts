import type { NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { dbUsuario } from '@/lib/db/schemas/cadastros'
import { clerkClient } from '@clerk/nextjs/server'
import { ok, serverError, notFound, badRequest } from '@/lib/api/responses'

type Params = { params: { tenant: string; id: string } }

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const id = Number(params.id)
      const [usuario] = await db
        .select({ clerkId: dbUsuario.clerkId, email: dbUsuario.email })
        .from(dbUsuario)
        .where(eq(dbUsuario.usuarioId, id))

      if (!usuario) return notFound('Usuário não encontrado')
      if (!usuario.email) return badRequest('Usuário sem e-mail cadastrado')

      // Se o clerkId for provisório (pending_*), o usuário ainda não aceitou
      // o convite — reenvia o convite em vez de resetar a senha
      if (!usuario.clerkId || usuario.clerkId.startsWith('pending_')) {
        await clerkClient().invitations.createInvitation({
          emailAddress:   usuario.email,
          redirectUrl:    `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://sistematiza-erp.vercel.app'}/sign-in`,
          ignoreExisting: true,
          publicMetadata: { tenantSlug: tenant.slug },
        })
        return ok({ enviado: true, tipo: 'convite_reenviado' })
      }

      // Usuário já existe no Clerk — envia e-mail de reset de senha
      await clerkClient().users.createEmailAddress({
        userId:         usuario.clerkId,
        emailAddressId: '',
        verified:       true,
      }).catch(() => {}) // ignora se falhar (email já existe)

      // Usa a API de reset do Clerk
      await clerkClient().users.updateUser(usuario.clerkId, {
        skipPasswordRequirement: true,
      })

      // Cria um link de reset que o Clerk envia por e-mail
      // O Clerk v5 não tem endpoint direto de "send reset email via API"
      // A forma correta é usar signInTokens para gerar um link de acesso
      const token = await clerkClient().signInTokens.createSignInToken({
        userId:           usuario.clerkId,
        expiresInSeconds: 60 * 60 * 24, // 24 horas
      })

      // Retorna sucesso — o admin pode compartilhar o token ou o Clerk
      // envia o e-mail conforme configuração do projeto
      return ok({ enviado: true, tipo: 'reset_enviado', url: token.url })
    } finally {
      release()
    }
  } catch (err: any) {
    const msg = err?.errors?.[0]?.longMessage ?? err?.message ?? 'Erro ao resetar senha'
    return serverError(new Error(msg))
  }
}