// app/(dashboard)/[tenant]/selecionar-modulo/page.tsx
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { eq, sql } from 'drizzle-orm'
import { getDbForTenant, getPublicDb } from '@/lib/db/connection'
import { dbTenant } from '@/lib/db/schemas/public'
import SelecionarModuloClient from './SelecionarModuloClient'
import { PerfisService } from '@/lib/services/perfis/PerfisService'

interface Props { params: { tenant: string } }

export default async function SelecionarModuloPage({ params }: Props) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const { db: publicDb, release: releasePublic } = await getPublicDb()
  let schemaName = ''
  try {
    const [tenant] = await publicDb.select().from(dbTenant).where(eq(dbTenant.slug, params.tenant))
    schemaName = tenant?.schemaName ?? ''
  } finally { releasePublic() }

  if (!schemaName) redirect('/onboarding')

  const { db, release } = await getDbForTenant(schemaName)
  let acessos = { gerencial: false, pdv: false, comanda: false, delivery: false }
  let darkModeInicial = false
  try {
    const service = new PerfisService(db)
    acessos = await service.getAcessosUsuario(userId)
  } catch (_) {
    acessos = { gerencial: true, pdv: true, comanda: true, delivery: true }
  }
  try {
    const cfgResult = await db.execute(sql`SELECT dark_mode FROM t_configuracoes_tenant LIMIT 1`)
    darkModeInicial = Boolean((cfgResult.rows[0] as any)?.dark_mode ?? false)
  } catch (_) {
    // sem configurações ainda
  } finally {
    release()
  }

  if (!acessos.gerencial && !acessos.pdv) redirect('/sign-in')

  return (
    <SelecionarModuloClient
      tenantSlug={params.tenant}
      acessos={acessos}
      darkModeInicial={darkModeInicial}
    />
  )
}