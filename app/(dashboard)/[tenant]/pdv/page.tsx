// ════════════════════════════════════════════════════════════════════════
// ESTE ARQUIVO VAI EM: app/(dashboard)/[tenant]/pdv/page.tsx
// (a pasta "pdv" — renderiza o PdvShell, NUNCA o Dashboard/TenantLayout)
// ════════════════════════════════════════════════════════════════════════
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { getDbForTenant, getPublicDb } from '@/lib/db/connection'
import { dbTenant } from '@/lib/db/schemas/public'
import { eq } from 'drizzle-orm'
import { PerfisService } from '@/lib/services/perfis/PerfisService'
import PdvShell from './PdvShell'

interface Props { params: { tenant: string } }

export default async function PdvPage({ params }: Props) {
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
  try {
    const acessos = await new PerfisService(db).getAcessosUsuario(userId)
    if (!acessos.pdv && !acessos.gerencial) {
      redirect(`/${params.tenant}/selecionar-modulo`)
    }
  } catch (_) {
    // sem perfis ainda — libera
  } finally { release() }

  return <PdvShell tenantSlug={params.tenant} />
}