// app/(dashboard)/[tenant]/pdv/page.tsx
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { getDbForTenant, getPublicDb } from '@/lib/db/connection'
import { dbTenant } from '@/lib/db/schemas/public'
import { eq } from 'drizzle-orm'
import { PerfisService } from '@/lib/services/perfis/PerfisService'
import PdvClient from './PdvClient'

interface Props { params: { tenant: string } }

export default async function PdvPage({ params }: Props) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  // Busca schema do tenant
  const { db: publicDb, release: releasePublic } = await getPublicDb()
  let schemaName = ''
  try {
    const [tenant] = await publicDb.select().from(dbTenant).where(eq(dbTenant.slug, params.tenant))
    schemaName = tenant?.schemaName ?? ''
  } finally { releasePublic() }

  if (!schemaName) redirect('/onboarding')

  // Valida acesso ao PDV
  const { db, release } = await getDbForTenant(schemaName)
  try {
    const service = new PerfisService(db)
    const acessos = await service.getAcessosUsuario(userId)
    if (!acessos.pdv && !acessos.gerencial) {
      redirect(`/${params.tenant}/selecionar-modulo`)
    }
  } catch (_) {
    // sem perfis ainda — libera
  } finally { release() }

  return <PdvClient tenantSlug={params.tenant} />
}