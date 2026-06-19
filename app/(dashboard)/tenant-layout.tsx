import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { pool } from '@/lib/db/connection'
import ClientShell from '@/components/layout/ClientShell'

interface Props {
  children:    React.ReactNode
  tenantSlug:  string
}

export default async function TenantLayout({ children, tenantSlug }: Props) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  // Busca configurações via raw SQL (padrão crítico — não alterar para Drizzle)
  const client = await pool.connect()
  let cfg: any = null
  let tenantName = tenantSlug

  try {
    // Busca o tenant na tabela pública
    const tenantResult = await client.query(
      `SELECT schema_name, tenant_name FROM public.t_tenant WHERE slug = $1 LIMIT 1`,
      [tenantSlug]
    )
    if (!tenantResult.rows[0]) redirect('/onboarding')

    const schemaName = tenantResult.rows[0].schema_name
    tenantName       = tenantResult.rows[0].tenant_name ?? tenantSlug

    // Lê configurações do schema do tenant via raw SQL
    await client.query(`SET search_path TO "${schemaName}", public`)
    const cfgResult = await client.query(
      `SELECT * FROM t_configuracoes_tenant LIMIT 1`
    )
    cfg = cfgResult.rows[0] ?? null
  } catch (_) {
    // tenant ainda não tem configurações — usa defaults
  } finally {
    client.release()
  }

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
    // Novos toggles — Financeiro Completo
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