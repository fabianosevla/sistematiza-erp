import type { ReactNode } from 'react'
import { auth, currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import ClientShell from '@/components/layout/ClientShell'
import { getDbForTenant, getPublicDb } from '@/lib/db/connection'
import { dbTenant } from '@/lib/db/schemas/public'
import { dbConfiguracoesTenant } from '@/lib/db/schemas/vendas'
import { eq } from 'drizzle-orm'

export default async function TenantLayout({ children, tenantSlug }: { children: ReactNode; tenantSlug: string }) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const user = await currentUser()
  const userTenantSlug = user?.publicMetadata?.tenantSlug as string | undefined
  if (!userTenantSlug || userTenantSlug !== tenantSlug) redirect('/onboarding')

  const tenantName = (user?.publicMetadata?.tenantName as string) ??
    tenantSlug.split('-').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')

  const { db: publicDb, release: releasePublic } = await getPublicDb()
  let schemaName = ''
  try {
    const [tenant] = await publicDb.select().from(dbTenant).where(eq(dbTenant.slug, tenantSlug))
    schemaName = tenant?.schemaName ?? ''
  } finally { releasePublic() }

  const config = {
    comandasAtivo: false, producaoAtivo: true, estoqueAtivo: true,
    fiscalAtivo: false, consultasAtivo: true, pedidosAtivo: true, planoAcaoAtivo: true,
  }

  if (schemaName) {
    const { db, release } = await getDbForTenant(schemaName)
    try {
      const [cfg] = await db.select().from(dbConfiguracoesTenant).limit(1)
      if (cfg) {
        config.comandasAtivo  = cfg.comandasAtivo
        config.producaoAtivo  = cfg.producaoAtivo  ?? true
        config.estoqueAtivo   = cfg.estoqueAtivo   ?? true
        config.fiscalAtivo    = cfg.fiscalAtivo    ?? false
        config.consultasAtivo = (cfg as any).consultasAtivo ?? true
        config.pedidosAtivo   = (cfg as any).pedidosAtivo   ?? true
        config.planoAcaoAtivo = (cfg as any).planoAcaoAtivo ?? true
      }
    } finally { release() }
  }

  return (
    <ClientShell tenantSlug={tenantSlug} tenantName={tenantName} config={config}>
      {children}
    </ClientShell>
  )
}