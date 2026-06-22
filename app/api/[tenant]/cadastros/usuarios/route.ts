import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { UsuarioService } from '@/lib/services/cadastros/UsuarioService'
import { clerkClient } from '@clerk/nextjs/server'
import { ok, serverError, badRequest } from '@/lib/api/responses'

type Params = { params: { tenant: string } }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const { searchParams } = new URL(req.url)
      const page  = Math.max(1, Number(searchParams.get('page') ?? 1))
      const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') ?? 20)))
      const service = new UsuarioService(db)
      const result  = await service.list({ page, limit })
      return ok(result)
    } finally {
      release()
    }
  } catch (err) {
    return serverError(err)
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const body   = await req.json()
    const { nome, email, perfil } = body

    if (!nome?.trim())  return badRequest('Nome é obrigatório')
    if (!email?.trim()) return badRequest('E-mail é obrigatório')

    // Usa createInvitation (Clerk v5) que envia o e-mail de convite corretamente.
    // O usuário clica no link, define a senha e o Clerk cria a conta.
    // createUser não envia e-mail — por isso o convite não chegava antes.
    try {
      await clerkClient().invitations.createInvitation({
        emailAddress: email.trim(),
        redirectUrl:  `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://sistematiza-erp.vercel.app'}/sign-in`,
        publicMetadata: {
          tenantSlug: tenant.slug,
          perfil:     perfil ?? 'user',
          nome:       nome.trim(),
        },
        ignoreExisting: false,
      })
    } catch (clerkErr: any) {
      const msg = clerkErr?.errors?.[0]?.longMessage
        ?? clerkErr?.errors?.[0]?.message
        ?? clerkErr?.message
        ?? 'Erro ao enviar convite'
      return badRequest(msg)
    }

    // Registra no banco local com clerkId provisório baseado no e-mail.
    // Quando o usuário aceitar o convite e fizer login pela primeira vez,
    // o sistema já encontra o registro pelo e-mail e sincroniza o clerkId real.
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const service   = new UsuarioService(db)
      const clerkIdProv = `pending_${email.trim().replace(/[^a-z0-9]/gi, '_')}`
      const result    = await service.create({
        clerkId: clerkIdProv,
        nome:    nome.trim(),
        email:   email.trim(),
        perfil:  perfil ?? 'user',
      }, 1)

      return ok({
        usuarioId: result?.usuarioId,
        email:     email.trim(),
        status:    'convite_enviado',
      })
    } finally {
      release()
    }
  } catch (err) {
    return serverError(err)
  }
}