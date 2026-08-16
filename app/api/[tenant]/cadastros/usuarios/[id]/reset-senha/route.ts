import type { NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'
import { resolveTenant } from '@/lib/auth/tenant'
import { exigirAdmin } from '@/lib/auth/permissoes'
import { getDbForTenant } from '@/lib/db/connection'
import { dbUsuario } from '@/lib/db/schemas/cadastros'
import { convidar, gerarLinkDeAcesso, ehProvisorio } from '@/lib/auth/identidade'
import { ok, serverError, notFound, badRequest } from '@/lib/api/responses'

type Params = { params: { tenant: string; id: string } }

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    // Gera um link de login direto para OUTRA conta — precisa ser admin,
    // senão qualquer usuário conseguia assumir a conta de qualquer outro
    // (inclusive de um admin) do mesmo tenant.
    await exigirAdmin(tenant.schemaName)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const id = Number(params.id)
      const [usuario] = await db
        .select({ clerkId: dbUsuario.clerkId, email: dbUsuario.email })
        .from(dbUsuario)
        .where(eq(dbUsuario.usuarioId, id))

      if (!usuario) return notFound('Usuário não encontrado')
      if (!usuario.email) return badRequest('Usuário sem e-mail cadastrado')

      // Usuário ainda não aceitou o convite — reenvia o convite
      if (!usuario.clerkId || ehProvisorio(usuario.clerkId)) {
        await convidar({
          email:       usuario.email,
          redirectUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://sistematiza-erp.vercel.app'}/sign-in`,
          dados:       { tenantSlug: tenant.slug },
        })
        return ok({ enviado: true, tipo: 'convite_reenviado' })
      }

      // Usuário existe no Clerk — gera token de acesso direto (válido 24h)
      // O admin copia o link e envia pro usuário, que clica e redefine a senha
      const url = await gerarLinkDeAcesso(usuario.clerkId)

      return ok({ enviado: true, tipo: 'link_gerado', url })
    } finally {
      release()
    }
  } catch (err: any) {
    const msg = err?.errors?.[0]?.longMessage ?? err?.message ?? 'Erro ao resetar senha'
    return serverError(new Error(msg))
  }
}