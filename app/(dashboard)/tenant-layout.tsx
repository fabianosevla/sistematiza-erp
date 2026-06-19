import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { pool, getPublicDb } from '@/lib/db/connection'
import { dbTenant } from '@/lib/db/schemas/public'
import ClientShell from '@/components/layout/ClientShell'

interface Props {
  children:    React.ReactNode
  tenantSlug:  string
}

export default async function TenantLayout({ children, tenantSlug }: Props) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  // 1. Resolve o schema do tenant via Drizzle — MESMO padrão usado em
  //    selecionar-modulo/page.tsx e pdv/page.tsx (já comprovadamente funciona)
  const { db: publicDb, release: releasePublic } = await getPublicDb()
  let schemaName = ''
  try {
    const [tenant] = await publicDb.select().from(dbTenant).where(eq(dbTenant.slug, tenantSlug))
    schemaName = tenant?.schemaName ?? ''
  } finally {
    releasePublic()
  }

  // CRÍTICO: redirect() nunca pode ficar dentro de um try/catch que o engula.
  // Next.js implementa redirect() lançando um erro especial — se um catch
  // genérico capturar esse erro, o redirect é silenciosamente ignorado.
  if (!schemaName) redirect('/onboarding')

  // 2. Lê configurações do schema do tenant via raw SQL
  //    (padrão crítico do projeto — não alterar para Drizzle ORM select)
  const client = await pool.connect()
  let cfg: any = null
  try {
    await client.query(`SET search_path TO "${schemaName}", public`)
    const cfgResult = await client.query(`SELECT * FROM t_configuracoes_tenant LIMIT 1`)
    cfg = cfgResult.rows[0] ?? null
  } catch (_) {
    // tenant ainda não tem configurações — usa defaults
  } finally {
    client.release()
  }

  const tenantName = cfg?.nome_empresa || cfg?.nome_fantasia || tenantSlug

  const config = {
    // Módulos existentes
    comandasAtivo:   cfg?.comandas_ativo   ?? false,
    producaoAtivo:   cfg?.producao_ativo   ?? true,
    estoqueAtivo:    cfg?.estoque_ativo    ?? true,
    fiscalAtivo:     cfg?.fiscal_ativo     ?? false,
    consultasAtivo:  cfg?.consultas_ativo  ?? true,
    pedidosAtivo:    cfg?.pedidos_ativo    ?? true,
    planoAcaoAtivo:  cfg?.plano_acao_ativo ?? false,
    metasAtivo:      cfg?.metas_ativo      ?? false,
    // Financeiro Completo
    contasPagarAtivo:         cfg?.contas_pagar_ativo         ?? false,
    contasReceberAtivo:       cfg?.contas_receber_ativo       ?? false,
    conciliacaoBancariaAtivo: cfg?.conciliacao_bancaria_ativo ?? false,
    // Metadados
    logoBase64: cfg?.logo_base64 ?? null,
    darkMode:   cfg?.dark_mode   ?? false,
  }

  return (
    <ClientShell
      tenantSlug={tenantSlug}
      tenantName={tenantName}
      config={config}
    >
      {children}
    </ClientShell>
  )
}