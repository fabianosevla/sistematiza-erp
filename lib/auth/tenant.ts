import { currentUser } from '@clerk/nextjs/server'
import { getPublicDb } from '@/lib/db/connection'
import { dbTenant } from '@/lib/db/schemas/public'
import { eq } from 'drizzle-orm'

/**
 * Valida que o usuário autenticado tem acesso ao tenant solicitado.
 * Retorna os dados do tenant.
 * Lança erro se não autorizado.
 */
export async function resolveTenant(tenantSlug: string) {
  const user = await currentUser()
  if (!user) throw new Error('UNAUTHORIZED')

  const userTenantSlug = user.publicMetadata?.tenantSlug as string | undefined
  if (!userTenantSlug || userTenantSlug !== tenantSlug) {
    throw new Error('FORBIDDEN')
  }

  const { db, release } = await getPublicDb()
  try {
    const [tenant] = await db
      .select()
      .from(dbTenant)
      .where(eq(dbTenant.slug, tenantSlug))

    if (!tenant || !tenant.activeFlag) throw new Error('TENANT_NOT_FOUND')
    return tenant
  } finally {
    release()
  }
}
