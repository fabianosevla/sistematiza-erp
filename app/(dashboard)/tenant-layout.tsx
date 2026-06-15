import type { ReactNode } from 'react'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { sql, eq } from 'drizzle-orm'
import ClientShell from '@/components/layout/ClientShell'
import { getDbForTenant, getPublicDb } from '@/lib/db/connection'
import { dbTenant } from '@/lib/db/schemas/public'

export default async function TenantLayout({
  children,
  tenantSlug,
}: {
  children: ReactNode
  tenantSlug: string
}) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const tenantName = tenantSlug
    .split('-')
    .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')

  const { db: publicDb, release: releasePublic } = await getPublicDb()
  let schemaName = ''
  try {
    const [tenant] = await publicDb.select().from(dbTenant).where(eq(dbTenant.slug, tenantSlug))
    schemaName = tenant?.schemaName ?? ''
  } finally { releasePublic() }

  const config = {
    comandasAtivo:  false,
    producaoAtivo:  true,
    estoqueAtivo:   true,
    fiscalAtivo:    false,
    consultasAtivo: true,
    pedidosAtivo:   true,
    planoAcaoAtivo: true,
    metasAtivo:     true,
  }

  if (schemaName) {
    const { db, release } = await getDbForTenant(schemaName)
    try {
      const result = await db.execute(sql`
        SELECT * FROM t_configuracoes_tenant WHERE active_flg = true LIMIT 1
      `)
      const cfg = result.rows[0] as any
      if (cfg) {
        config.comandasAtivo  = cfg.comandas_ativo   ?? false
        config.producaoAtivo  = cfg.producao_ativo   ?? true
        config.estoqueAtivo   = cfg.estoque_ativo    ?? true
        config.fiscalAtivo    = cfg.fiscal_ativo     ?? false
        config.consultasAtivo = cfg.consultas_ativo  ?? true
        config.pedidosAtivo   = cfg.pedidos_ativo    ?? true
        config.planoAcaoAtivo = cfg.plano_acao_ativo ?? true
        config.metasAtivo     = cfg.metas_ativo      ?? true
      }
    } catch (_) {
      // usa defaults
    } finally { release() }
  }

  return (
    <ClientShell tenantSlug={tenantSlug} tenantName={tenantName} config={config}>
      {children}
    </ClientShell>
  )
}