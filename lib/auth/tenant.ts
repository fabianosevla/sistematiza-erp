import { currentUser } from '@clerk/nextjs/server'
import { getPublicDb, pool } from '@/lib/db/connection'
import { dbTenant } from '@/lib/db/schemas/public'
import { eq } from 'drizzle-orm'

/**
 * Valida que o usuário autenticado tem acesso ao tenant solicitado.
 * Verifica também que o usuário existe e está ativo no banco do tenant.
 * Sincroniza clerkId quando o usuário aceita o convite.
 */
export async function resolveTenant(tenantSlug: string) {
  const user = await currentUser()
  if (!user) throw new Error('UNAUTHORIZED')

  const userTenantSlug = user.publicMetadata?.tenantSlug as string | undefined
  if (!userTenantSlug || userTenantSlug !== tenantSlug) {
    throw new Error('FORBIDDEN')
  }

  const { db, release } = await getPublicDb()
  let tenant: any
  try {
    const [t] = await db
      .select()
      .from(dbTenant)
      .where(eq(dbTenant.slug, tenantSlug))
    if (!t || !t.activeFlag) throw new Error('TENANT_NOT_FOUND')
    tenant = t
  } finally {
    release()
  }

  // Verifica e sincroniza o usuário no banco do tenant
  const client = await pool.connect()
  try {
    await client.query(`SET search_path TO "${tenant.schemaName}", public`)

    // 1. Tenta encontrar pelo clerkId real
    let result = await client.query(
      `SELECT usuario_id, nome, active_flg, clerk_id, email
       FROM t_usuario WHERE clerk_id = $1 AND active_flg = true LIMIT 1`,
      [user.id]
    )

    // 2. Se não encontrou, tenta pelo e-mail (convite pendente que aceitou)
    if (result.rows.length === 0) {
      const userEmail = user.emailAddresses?.[0]?.emailAddress
      if (userEmail) {
        result = await client.query(
          `SELECT usuario_id, nome, active_flg, clerk_id, email
           FROM t_usuario 
           WHERE LOWER(email) = LOWER($1) AND active_flg = true LIMIT 1`,
          [userEmail]
        )

        if (result.rows.length > 0) {
          const usuarioPendente = result.rows[0]
          // Sincroniza o clerkId real (usuário aceitou o convite)
          await client.query(
            `UPDATE t_usuario SET clerk_id = $1, updated_dt = NOW() 
             WHERE usuario_id = $2`,
            [user.id, usuarioPendente.usuario_id]
          )
        }
      }
    }

    // 3. Se não encontrou por nenhum método — usuário não tem acesso
    if (result.rows.length === 0) {
      throw new Error('USER_NOT_IN_TENANT')
    }

  } finally {
    client.release()
  }

  return tenant
}