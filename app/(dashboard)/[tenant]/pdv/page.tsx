// ════════════════════════════════════════════════════════════════════════
// ESTE ARQUIVO VAI EM: app/(dashboard)/[tenant]/pdv/page.tsx
// ════════════════════════════════════════════════════════════════════════
import { idLogado } from '@/lib/auth/identidade'
import { redirect } from 'next/navigation'
import { getDbForTenant } from '@/lib/db/connection'
import { resolveTenant } from '@/lib/auth/tenant'
import { sql } from 'drizzle-orm'
import { PerfisService } from '@/lib/services/perfis/PerfisService'
import PdvShell from './PdvShell'

interface Props { params: { tenant: string } }

export default async function PdvPage({ params }: Props) {
  const userId = await idLogado()
  if (!userId) redirect('/sign-in')

  // resolveTenant, não só "o slug existe" — confere se ESTE usuário está
  // cadastrado em t_usuario deste schema, mesma checagem do tenant-layout.
  let schemaName: string
  try {
    const tenant = await resolveTenant(params.tenant)
    schemaName = tenant.schemaName
  } catch {
    redirect('/onboarding')
  }

  const { db, release } = await getDbForTenant(schemaName)
  try {
    const acessos = await new PerfisService(db).getAcessosUsuario(userId)
    if (!acessos.pdv && !acessos.gerencial) {
      redirect(`/${params.tenant}/selecionar-modulo`)
    }
  } catch (_) {
    // sem perfis ainda — libera
  }

  let darkModeInicial = false
  try {
    const cfgResult = await db.execute(sql`SELECT dark_mode FROM t_configuracoes_tenant LIMIT 1`)
    darkModeInicial = Boolean((cfgResult.rows[0] as any)?.dark_mode ?? false)
  } catch (_) {
    // tenant sem configurações ainda — mantém claro
  } finally {
    release()
  }

  return <PdvShell tenantSlug={params.tenant} darkModeInicial={darkModeInicial} />
}