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

    // 1. Criar o usuário no Clerk
    // O Clerk envia o e-mail de convite automaticamente quando skipPasswordRequirement
    // e emailAddress são fornecidos — o usuário define a própria senha pelo link.
    let clerkUser: any
    try {
      clerkUser = await clerkClient().users.createUser({
        emailAddress:            [email.trim()],
        firstName:               nome.trim().split(' ')[0],
        lastName:                nome.trim().split(' ').slice(1).join(' ') || undefined,
        skipPasswordRequirement: true,
        publicMetadata: {
          tenantSlug: tenant.slug,
          perfil:     perfil ?? 'user',
        },
      })
    } catch (clerkErr: any) {
      // Clerk retorna array de erros — extraímos a mensagem legível
      const msg = clerkErr?.errors?.[0]?.longMessage
        ?? clerkErr?.errors?.[0]?.message
        ?? clerkErr?.message
        ?? 'Erro ao criar usuário no Clerk'
      return badRequest(msg)
    }

    // 2. Registrar no banco local do tenant
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const service = new UsuarioService(db)
      const result  = await service.create({
        clerkId: clerkUser.id,
        nome:    nome.trim(),
        email:   email.trim(),
        perfil:  perfil ?? 'user',
      }, 1)

      return ok({
        usuarioId: result?.usuarioId,
        clerkId:   clerkUser.id,
        nome:      nome.trim(),
        email:     email.trim(),
      })
    } finally {
      release()
    }
  } catch (err) {
    return serverError(err)
  }
}