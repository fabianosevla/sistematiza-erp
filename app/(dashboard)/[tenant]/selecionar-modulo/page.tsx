// app/(dashboard)/[tenant]/selecionar-modulo/page.tsx
import { idLogado } from '@/lib/auth/identidade'
import { redirect } from 'next/navigation'
import { sql } from 'drizzle-orm'
import { getDbForTenant } from '@/lib/db/connection'
import { resolveTenant } from '@/lib/auth/tenant'
import SelecionarModuloClient from './SelecionarModuloClient'
import { PerfisService } from '@/lib/services/perfis/PerfisService'

interface Props { params: { tenant: string } }

export default async function SelecionarModuloPage({ params }: Props) {
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
  let acessos = { gerencial: false, pdv: false, comanda: false, delivery: false }
  let darkModeInicial = false
  try {
    const service = new PerfisService(db)
    acessos = await service.getAcessosUsuario(userId)
  } catch (_) {
    // erro real de leitura — nega por padrão, nunca libera acesso "por garantia".
    acessos = { gerencial: false, pdv: false, comanda: false, delivery: false }
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