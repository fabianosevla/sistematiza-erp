import { idLogado } from '@/lib/auth/identidade'
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
  const userId = await idLogado()
  if (!userId) redirect('/sign-in')

  const { db: publicDb, release: releasePublic } = await getPublicDb()
  let schemaName = ''
  try {
    const [tenant] = await publicDb.select().from(dbTenant).where(eq(dbTenant.slug, tenantSlug))
    schemaName = tenant?.schemaName ?? ''
  } finally {
    releasePublic()
  }

  if (!schemaName) redirect('/onboarding')

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
    comandasAtivo:   cfg?.comandas_ativo   ?? false,
    producaoAtivo:   cfg?.producao_ativo   ?? true,
    estoqueAtivo:    cfg?.estoque_ativo    ?? true,
    fiscalAtivo:     cfg?.fiscal_ativo     ?? false,
    turnoCaixaAtivo: cfg?.turno_caixa_ativo ?? false,
    consultasAtivo:  cfg?.consultas_ativo  ?? true,
    pedidosAtivo:    cfg?.pedidos_ativo    ?? true,
    planoAcaoAtivo:  cfg?.plano_acao_ativo ?? false,
    metasAtivo:      cfg?.metas_ativo      ?? false,
    contasPagarAtivo:         cfg?.contas_pagar_ativo         ?? false,
    contasReceberAtivo:       cfg?.contas_receber_ativo       ?? false,

    // Compras: a coluna correta é compras_ativo — é onde a API grava.
    // modulo_compras_ativo fica como segundo fallback só para bases antigas
    // que ainda não rodaram scripts/migrate-menu-flags.js.
    comprasAtivo:    cfg?.compras_ativo    ?? cfg?.modulo_compras_ativo ?? true,

    // Menus que antes não tinham chave nenhuma
    vendasAtivo:     cfg?.vendas_ativo     ?? true,
    financeiroAtivo: cfg?.financeiro_ativo ?? true,
    fidelidadeAtivo: cfg?.fidelidade_ativo ?? true,

    entradaNfeAtivo:          cfg?.entrada_nfe_ativo          ?? true,
    perdaProdutoAtivo:        cfg?.perda_produto_ativo        ?? true,
    contagemInventarioAtivo:  cfg?.contagem_inventario_ativo  ?? true,
    multiplosLocaisAtivo:     cfg?.multiplos_locais_ativo     ?? false,
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