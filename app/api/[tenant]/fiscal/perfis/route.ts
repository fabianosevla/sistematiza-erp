// @ts-nocheck
// ESTE ARQUIVO VAI EM: app/api/[tenant]/fiscal/perfis/route.ts
import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { usuarioAtualIdDb } from '@/lib/auth/usuarioAtual'
import { PerfilTributarioService } from '@/lib/services/fiscal/PerfilTributarioService'
import { ok, created, serverError, badRequest, forbidden } from '@/lib/api/responses'
import { sql } from 'drizzle-orm'
import type { AppDB } from '@/lib/db/connection'

type Params = { params: { tenant: string } }

/**
 * O módulo fiscal desligado tranca também a API, não só a tela.
 *
 * Esconder o menu resolve o que o operador vê; não resolve quem chama a rota
 * direto. E, num sistema vendido por assinatura, módulo não contratado que
 * responde pela API é módulo entregue de graça.
 */
export async function fiscalLigado(db: AppDB): Promise<boolean> {
  const r = await db.execute(sql`SELECT fiscal_ativo FROM t_configuracoes_tenant LIMIT 1`)
  return (r.rows[0] as any)?.fiscal_ativo === true
}

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      if (!(await fiscalLigado(db))) return forbidden()
      const service = new PerfilTributarioService(db)
      const [perfis, uso] = await Promise.all([service.list(), service.contagemPorPerfil()])
      return ok({ perfis, uso })
    } finally { release() }
  } catch (err) { return serverError(err) }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      if (!(await fiscalLigado(db))) return forbidden()
      const body = await req.json()
      if (!String(body.nome ?? '').trim()) return badRequest('Informe o nome do perfil.')
      const userId = await usuarioAtualIdDb(db)
      return created(await new PerfilTributarioService(db).criar(body, userId))
    } finally { release() }
  } catch (err) { return serverError(err) }
}
