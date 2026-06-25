// @ts-nocheck
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { PerfisService } from '@/lib/services/perfis/PerfisService'
import { dbUsuario } from '@/lib/db/schemas/cadastros'
import { ok, serverError, notFound, badRequest } from '@/lib/api/responses'

type Params = { params: { tenant: string; id: string } }

const schema = z.object({
  nome:      z.string().min(2).max(100).optional(),
  descricao: z.string().max(300).optional(),
  acessoGerencial: z.boolean().optional(),
  acessoPdv:       z.boolean().optional(),
  acessoComanda:   z.boolean().optional(),
  acessoDelivery:  z.boolean().optional(),
  moduloDashboard:  z.boolean().optional(),
  moduloCadastros:  z.boolean().optional(),
  moduloVendas:     z.boolean().optional(),
  moduloFinanceiro: z.boolean().optional(),
  moduloEstoque:    z.boolean().optional(),
  moduloProducao:   z.boolean().optional(),
  moduloPedidos:    z.boolean().optional(),
  moduloComandas:   z.boolean().optional(),
  moduloConsultas:  z.boolean().optional(),
  moduloFiscal:     z.boolean().optional(),
  moduloPlanoAcao:  z.boolean().optional(),
  moduloMetas:      z.boolean().optional(),
  moduloUsuarios:   z.boolean().optional(),
  percDescontoMax:  z.number().min(0).max(100).optional(),
  valorDescontoMax: z.number().int().min(0).optional(),
  isAdmin:          z.boolean().optional(),
})

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const perfil = await new PerfisService(db).findById(Number(params.id))
      if (!perfil) return notFound('Perfil não encontrado')
      return ok(perfil)
    } finally { release() }
  } catch (err) { return serverError(err) }
}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const id      = Number(params.id)
      const payload = schema.parse(await req.json())
      const perfil  = await new PerfisService(db).findById(id)
      if (!perfil) return notFound('Perfil não encontrado')
      const updated = await new PerfisService(db).atualizar(id, {
        ...payload,
        percDescontoMax: payload.percDescontoMax !== undefined
          ? String(payload.percDescontoMax)
          : undefined,
      }, 1)
      return ok(updated)
    } finally { release() }
  } catch (err) { return serverError(err) }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const id = Number(params.id)

      // Verifica se há usuários vinculados ao perfil
      const usuarios = await db
        .select({ usuarioId: dbUsuario.usuarioId, nome: dbUsuario.nome })
        .from(dbUsuario)
        .where(eq((dbUsuario as any).perfilId, id))

      if (usuarios.length > 0) {
        return badRequest(
          `Não é possível excluir este perfil pois ${usuarios.length} usuário(s) estão vinculados a ele: ${usuarios.map(u => u.nome).join(', ')}.`
        )
      }

      const result = await new PerfisService(db).excluir(id, 1)
      if (!result) return notFound('Perfil não encontrado')
      return ok({ excluido: true })
    } finally { release() }
  } catch (err) { return serverError(err) }
}