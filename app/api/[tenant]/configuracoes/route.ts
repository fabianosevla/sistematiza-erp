// app/api/[tenant]/configuracoes/route.ts
// CRÍTICO: usa raw SQL UPDATE individual por campo — não alterar para Drizzle
import type { NextRequest } from 'next/server'
import { pool } from '@/lib/db/connection'
import { resolveTenant } from '@/lib/auth/tenant'
import { ok, serverError } from '@/lib/api/responses'

type Params = { params: { tenant: string } }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const client = await pool.connect()
    try {
      await client.query(`SET search_path TO "${tenant.schemaName}", public`)
      const result = await client.query(`SELECT * FROM t_configuracoes_tenant LIMIT 1`)
      const r = result.rows[0] ?? {}
      return ok({
        comandasAtivo:   r.comandas_ativo   ?? false,
        producaoAtivo:   r.producao_ativo   ?? true,
        estoqueAtivo:    r.estoque_ativo    ?? true,
        fiscalAtivo:     r.fiscal_ativo     ?? false,
        consultasAtivo:  r.consultas_ativo  ?? true,
        pedidosAtivo:    r.pedidos_ativo    ?? true,
        planoAcaoAtivo:  r.plano_acao_ativo ?? false,
        metasAtivo:      r.metas_ativo      ?? false,
        contasPagarAtivo:         r.contas_pagar_ativo         ?? false,
        contasReceberAtivo:       r.contas_receber_ativo       ?? false,
        conciliacaoBancariaAtivo: r.conciliacao_bancaria_ativo ?? false,
        comprasAtivo:             r.modulo_compras_ativo       ?? true,
        entradaNfeAtivo:          r.entrada_nfe_ativo          ?? true,
        perdaProdutoAtivo:        r.perda_produto_ativo        ?? true,
        contagemInventarioAtivo:  r.contagem_inventario_ativo  ?? true,
        multiplosLocaisAtivo:     r.multiplos_locais_ativo     ?? false,
        logoBase64: r.logo_base64 ?? null,
        darkMode:   r.dark_mode   ?? false,
        nomeEmpresa:  r.nome_empresa  ?? '',
        nomeFantasia: r.nome_fantasia ?? '',
        cnpj:         r.cnpj          ?? '',
        telefone:     r.telefone      ?? '',
        email:        r.email         ?? '',
        endereco:     r.endereco      ?? '',
        cidade:       r.cidade        ?? '',
        uf:           r.uf            ?? '',
        cep:          r.cep           ?? '',
        ieEstadual:       r.ie_estadual        ?? '',
        regimeTributario: r.regime_tributario  ?? '',
        focusNfeToken:    r.focus_nfe_token    ?? '',
        focusNfeAmbiente: r.focus_nfe_ambiente ?? 'homologacao',
      })
    } finally { client.release() }
  } catch (err) { return serverError(err) }
}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const body   = await req.json()
    const client = await pool.connect()

    try {
      await client.query(`SET search_path TO "${tenant.schemaName}", public`)

      const updates: [string, any][] = [
        ['comandas_ativo',           body.comandasAtivo],
        ['producao_ativo',           body.producaoAtivo],
        ['estoque_ativo',            body.estoqueAtivo],
        ['fiscal_ativo',             body.fiscalAtivo],
        ['consultas_ativo',          body.consultasAtivo],
        ['pedidos_ativo',            body.pedidosAtivo],
        ['plano_acao_ativo',         body.planoAcaoAtivo],
        ['metas_ativo',              body.metasAtivo],
        ['contas_pagar_ativo',         body.contasPagarAtivo],
        ['contas_receber_ativo',       body.contasReceberAtivo],
        ['conciliacao_bancaria_ativo', body.conciliacaoBancariaAtivo],
        ['modulo_compras_ativo',       body.comprasAtivo],
        ['entrada_nfe_ativo',          body.entradaNfeAtivo],
        ['perda_produto_ativo',        body.perdaProdutoAtivo],
        ['contagem_inventario_ativo',  body.contagemInventarioAtivo],
        ['multiplos_locais_ativo',     body.multiplosLocaisAtivo],
        ['logo_base64', body.logoBase64],
        ['dark_mode',   body.darkMode],
        ['nome_empresa',  body.nomeEmpresa],
        ['nome_fantasia', body.nomeFantasia],
        ['cnpj',          body.cnpj],
        ['telefone',      body.telefone],
        ['email',         body.email],
        ['endereco',      body.endereco],
        ['cidade',        body.cidade],
        ['uf',            body.uf],
        ['cep',           body.cep],
        ['ie_estadual',        body.ieEstadual],
        ['regime_tributario',  body.regimeTributario],
        ['focus_nfe_token',    body.focusNfeToken],
        ['focus_nfe_ambiente', body.focusNfeAmbiente],
      ]

      for (const [col, val] of updates) {
        if (val !== undefined) {
          await client.query(
            `UPDATE t_configuracoes_tenant SET ${col} = $1`,
            [val]
          )
        }
      }

      return ok({ updated: true })
    } finally { client.release() }
  } catch (err) { return serverError(err) }
}