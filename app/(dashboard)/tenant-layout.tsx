import type { ReactNode } from 'react'
import { auth, currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/layout/Sidebar'
import Header  from '@/components/layout/Header'
import { getDbForTenant, getPublicDb } from '@/lib/db/connection'
import { dbTenant } from '@/lib/db/schemas/public'
import { dbConfiguracoesTenant } from '@/lib/db/schemas/vendas'
import { eq } from 'drizzle-orm'

export default async function TenantLayout({
  children,
  tenantSlug,
}: {
  children: ReactNode
  tenantSlug: string
}) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const user = await currentUser()
  const userTenantSlug = user?.publicMetadata?.tenantSlug as string | undefined
  if (!userTenantSlug || userTenantSlug !== tenantSlug) redirect('/onboarding')

  const tenantName = (user?.publicMetadata?.tenantName as string) ?? tenantSlug

  const { db: publicDb, release: releasePublic } = await getPublicDb()
  let schemaName = ''
  try {
    const [tenant] = await publicDb.select().from(dbTenant).where(eq(dbTenant.slug, tenantSlug))
    schemaName = tenant?.schemaName ?? ''
  } finally {
    releasePublic()
  }

  const cfg = {
    comandasAtivo: false,
    producaoAtivo: true,
    vendasAtivo:   true,
    estoqueAtivo:  true,
    fiscalAtivo:   false,
  }

  if (schemaName) {
    const { db, release } = await getDbForTenant(schemaName)
    try {
      const [config] = await db.select().from(dbConfiguracoesTenant).limit(1)
      if (config) {
        cfg.comandasAtivo = config.comandasAtivo
        cfg.producaoAtivo = config.producaoAtivo ?? true
        cfg.vendasAtivo   = config.vendasAtivo   ?? true
        cfg.estoqueAtivo  = config.estoqueAtivo  ?? true
        cfg.fiscalAtivo   = config.fiscalAtivo   ?? false
      }
    } finally {
      release()
    }
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar
        tenantSlug={tenantSlug}
        tenantName={tenantName}
        comandasAtivo={cfg.comandasAtivo}
        producaoAtivo={cfg.producaoAtivo}
        vendasAtivo={cfg.vendasAtivo}
        estoqueAtivo={cfg.estoqueAtivo}
        fiscalAtivo={cfg.fiscalAtivo}
      />
      <div className="flex-1 flex flex-col">
        <Header tenantName={tenantName} tenantSlug={tenantSlug} />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  )
}