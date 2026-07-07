// @ts-nocheck
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant, pool } from '@/lib/db/connection'
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
    const { pool: dbPool } = await import('@/lib/db/connection')
    const client = await dbPool.connect()
    try {
      await client.query(`SET search_path TO "${tenant.schemaName}", public`)
      const id = Number(params.id)

      // Verificar usuários vinculados
      const usersRes = await client.query(
        'SELECT usuario_id, nome FROM t_usuario WHERE perfil_id = $1 AND active_flg = true',
        [id]
      )
      if (usersRes.rows.length > 0) {
        const nomes = usersRes.rows.map(u => u.nome).join(', ')
        return badRequest(`Não é possível excluir: ${usersRes.rows.length} usuário(s) vinculado(s): ${nomes}.`)
      }

      // Soft delete do perfil
      const delRes = await client.query(
        'UPDATE t_perfil_acesso SET active_flg = false, updated_dt = NOW() WHERE perfil_id = $1 AND active_flg = true RETURNING perfil_id',
        [id]
      )
      if (delRes.rows.length === 0) return notFound('Perfil não encontrado')
      return ok({ excluido: true })
    } finally { client.release() }
  } catch (err) { return serverError(err) }
}