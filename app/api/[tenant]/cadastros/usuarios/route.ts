// @ts-nocheck
import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { UsuarioService } from '@/lib/services/cadastros/UsuarioService'
import { convidar, idProvisorio } from '@/lib/auth/identidade'
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
      return ok(await new UsuarioService(db).list({ page, limit }))
    } finally { release() }
  } catch (err) { return serverError(err) }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const body   = await req.json()
    const { nome, email, perfil, perfilId } = body
    if (!nome?.trim())  return badRequest('Nome é obrigatório')
    if (!email?.trim()) return badRequest('E-mail é obrigatório')

    // Verifica se já existe usuário com o mesmo email no banco local (mesmo deletados do Clerk)
    // Se existir com clerkId pending_, é um convite antigo que pode ser refeito
    const { db: dbCheck, release: releaseCheck } = await getDbForTenant(tenant.schemaName)
    let usuarioExistente: any = null
    try {
      const service = new UsuarioService(dbCheck)
      usuarioExistente = await service.findByEmail(email.trim())
    } finally { releaseCheck() }

    // Envia o convite. O tenantSlug vai junto por conveniência, mas quem
    // autoriza o acesso é o registro em t_usuario logo abaixo — o convite não
    // precisa propagar metadado nenhum para a pessoa conseguir entrar.
    try {
      await convidar({
        email:       email.trim(),
        redirectUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://sistematiza-erp.vercel.app'}/${tenant.slug}`,
        dados: {
          tenantSlug: tenant.slug,
          perfil:     perfil ?? 'user',
          nome:       nome.trim(),
        },
      })
    } catch (clerkErr: any) {
      const msg = clerkErr?.errors?.[0]?.longMessage
        ?? clerkErr?.errors?.[0]?.message
        ?? clerkErr?.message
        ?? 'Erro ao enviar convite'
      // Se o erro não for de email duplicado, retorna erro
      if (!msg.toLowerCase().includes('already') && !msg.toLowerCase().includes('exist')) {
        return badRequest(msg)
      }
    }

    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const service   = new UsuarioService(db)
      const clerkIdProv = idProvisorio(email)

      // Se já existe no banco, atualiza o registro em vez de criar novo
      if (usuarioExistente) {
        await service.update(usuarioExistente.usuarioId, {
          nome:    nome.trim(),
          clerkId: clerkIdProv,
          perfil:  perfil ?? 'user',
        })
        return ok({
          usuarioId: usuarioExistente.usuarioId,
          email:     email.trim(),
          status:    'convite_reenviado',
        })
      }

      const result = await service.create({
        clerkId:  clerkIdProv,
        nome:     nome.trim(),
        email:    email.trim(),
        perfil:   perfil ?? 'user',
        perfilId: perfilId ?? null,
      }, 1)
      return ok({
        usuarioId: result?.usuarioId,
        email:     email.trim(),
        status:    'convite_enviado',
      })
    } finally { release() }
  } catch (err) { return serverError(err) }
}
