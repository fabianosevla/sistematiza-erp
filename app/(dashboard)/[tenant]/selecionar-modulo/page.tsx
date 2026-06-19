// app/(dashboard)/[tenant]/selecionar-modulo/page.tsx
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { getDbForTenant, getPublicDb } from '@/lib/db/connection'
import { dbTenant } from '@/lib/db/schemas/public'
import SelecionarModuloClient from './SelecionarModuloClient'
import { PerfisService } from '@/lib/services/perfis/PerfisService'

interface Props { params: { tenant: string } }

export default async function SelecionarModuloPage({ params }: Props) {
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

  // Busca acessos do usuário
  const { db, release } = await getDbForTenant(schemaName)
  let acessos = { gerencial: false, pdv: false, comanda: false, delivery: false }
  try {
    const service = new PerfisService(db)
    acessos = await service.getAcessosUsuario(userId)
  } catch (_) {
    // Se perfis ainda não existem, admin tem acesso a tudo
    acessos = { gerencial: true, pdv: true, comanda: true, delivery: true }
  } finally { release() }

  // ⚠️ SEM auto-redirect. Esta tela SEMPRE se mostra, mesmo que o usuário
  // tenha só um ambiente disponível (nesse caso aparece um único card).
  // Isso garante que botões como "Sair" do PDV — que levam pra cá — nunca
  // se transformam num teleporte silencioso direto pro Gerencial ou pro PDV.
  if (!acessos.gerencial && !acessos.pdv) redirect('/sign-in')

  return (
    <SelecionarModuloClient
      tenantSlug={params.tenant}
      acessos={acessos}
    />
  )
}