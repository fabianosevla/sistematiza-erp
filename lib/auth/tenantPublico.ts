// ESTE ARQUIVO VAI EM: lib/auth/tenantPublico.ts
//
// Resolve tenant para rotas SEM login — hoje só o cardápio online.
//
// `resolveTenant` (lib/auth/tenant.ts) exige um usuário Clerk autenticado e
// checa o vínculo dele em t_usuario. Isso é certo para o resto do sistema,
// mas quebraria a única URL do projeto pensada para abrir sem sessão nenhuma
// — o cliente lendo o cardápio pelo QR Code no celular.
//
// Aqui a checagem é só o que o link público precisa provar: o tenant existe,
// está ativo, e contratou o módulo. Nada sobre QUEM está olhando.
import { getPublicDb, pool } from '@/lib/db/connection'
import { dbTenant } from '@/lib/db/schemas/public'
import { eq } from 'drizzle-orm'

export async function resolveTenantPublico(slug: string) {
  const { db, release } = await getPublicDb()
  let tenant: any
  try {
    const [t] = await db.select().from(dbTenant).where(eq(dbTenant.slug, slug))
    if (!t || !t.activeFlag) return null
    tenant = t
  } finally {
    release()
  }

  const client = await pool.connect()
  try {
    await client.query(`SET search_path TO "${tenant.schemaName}", public`)
    const cfg = await client.query(`SELECT cardapio_ativo FROM t_configuracoes_tenant LIMIT 1`)
    if (cfg.rows[0]?.cardapio_ativo !== true) return null
  } finally {
    client.release()
  }

  return tenant as { schemaName: string; slug: string; name: string }
}
