// app/api/[tenant]/configuracoes/route.ts
// CRÍTICO: usa raw SQL UPDATE individual por campo — não alterar para Drizzle
import type { NextRequest } from 'next/server'
import { pool } from '@/lib/db/connection'
import { resolveTenant } from '@/lib/auth/tenant'
import { souAdmin, exigirAdmin } from '@/lib/auth/permissoes'
import { decryptSecretOuTextoPuro, encryptSecret } from '@/lib/crypto/secretBox'
import { ok, serverError } from '@/lib/api/responses'

type Params = { params: { tenant: string } }

// Campos fora deste conjunto só podem ser alterados por admin. darkMode é
// trocado por qualquer usuário logado (toggle de tema, ver hooks/useDarkMode.ts).
const CAMPOS_LIVRES = new Set(['darkMode'])

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const admin  = await souAdmin(tenant.schemaName)
    const client = await pool.connect()
    try {
      await client.query(`SET search_path TO "${tenant.schemaName}", public`)
      const result = await client.query(`SELECT * FROM t_configuracoes_tenant LIMIT 1`)
      const r = result.rows[0] ?? {}
      // Token do emissor fiscal: só admin recebe o valor. Para os demais,
      // o campo some da resposta — quem só usa esta rota para ler flags de
      // módulo (financeiro, estoque, dark mode etc.) nunca precisou dele.
      const focusNfeToken = admin
        ? decryptSecretOuTextoPuro(r.focus_nfe_token)
        : null
      return ok({
        // Módulos existentes
        comandasAtivo:   r.comandas_ativo   ?? false,
        producaoAtivo:   r.producao_ativo   ?? true,
        estoqueAtivo:    r.estoque_ativo    ?? true,
        fiscalAtivo:     r.fiscal_ativo     ?? false,
        turnoCaixaAtivo: r.turno_caixa_ativo ?? false,
        qtdCaixas:       r.qtd_caixas   ?? 1,
        regimeTurno:     r.regime_turno ?? 'dia',
        consultasAtivo:  r.consultas_ativo  ?? true,
        pedidosAtivo:    r.pedidos_ativo    ?? true,
        planoAcaoAtivo:  r.plano_acao_ativo ?? false,
        metasAtivo:      r.metas_ativo      ?? false,
        cardapioAtivo:   r.cardapio_ativo   ?? false,
        // Compras — compras_ativo é a coluna oficial; modulo_compras_ativo é
        // o nome antigo, mantido como fallback para bases ainda não migradas
        comprasAtivo:    r.compras_ativo    ?? r.modulo_compras_ativo ?? true,
        // Menus que antes não tinham chave
        vendasAtivo:     r.vendas_ativo     ?? true,
        financeiroAtivo: r.financeiro_ativo ?? true,
        // Fidelidade (cashback)
        fidelidadeAtivo: r.fidelidade_ativo ?? true,
        // Financeiro Completo
        contasPagarAtivo:         r.contas_pagar_ativo         ?? false,
        contasReceberAtivo:       r.contas_receber_ativo       ?? false,
        // Fiscal — parametrização da empresa. Preenchida pelo contador.
        // Ver scripts/migrate-fiscal-parametrizacao.js
        crt:              r.crt              ?? null,
        regimeTributario: r.regime_tributario ?? null,
        serieNfce:        r.serie_nfce       ?? '1',
        serieNfe:         r.serie_nfe        ?? '1',
        credenciadoNfce:  r.credenciado_nfce ?? false,
        credenciadoNfe:   r.credenciado_nfe  ?? false,
        cnae:             r.cnae             ?? null,
        mensagemFiscal:   r.mensagem_fiscal  ?? null,
        focusNfeToken,
        focusNfeAmbiente: r.focus_nfe_ambiente ?? 'homologacao',
        // Aparência
        logoBase64: r.logo_base64 ?? null,
        darkMode:   r.dark_mode   ?? false,
        // Dados da empresa — usados no cabeçalho do cupom e em documentos
        nomeEmpresa:        r.nome_empresa        ?? '',
        nomeFantasia:       r.nome_fantasia       ?? '',
        cnpj:               r.cnpj                ?? '',
        inscricaoEstadual:  r.inscricao_estadual  ?? '',
        inscricaoMunicipal: r.inscricao_municipal ?? '',
        telefone:           r.telefone            ?? '',
        email:              r.email               ?? '',
        cep:                r.cep                 ?? '',
        endereco:           r.endereco            ?? '',
        numero:             r.numero              ?? '',
        complemento:        r.complemento         ?? '',
        bairro:             r.bairro              ?? '',
        cidade:             r.cidade              ?? '',
        uf:                 r.uf                  ?? '',
        // Frase livre impressa no rodapé do cupom
        mensagemCupom:      r.mensagem_cupom      ?? '',
      })
    } finally { client.release() }
  } catch (err) { return serverError(err) }
}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const body   = await req.json()

    // Qualquer campo fora do conjunto livre (hoje só darkMode) é dado de
    // empresa/fiscal/módulo — exige admin. Sem isto, qualquer usuário
    // autenticado do tenant conseguia reconfigurar módulos, dados fiscais
    // e o token do emissor.
    const pedeCampoRestrito = Object.keys(body).some(k => !CAMPOS_LIVRES.has(k))
    if (pedeCampoRestrito) await exigirAdmin(tenant.schemaName)

    const client = await pool.connect()

    try {
      await client.query(`SET search_path TO "${tenant.schemaName}", public`)

      // Só grava em coluna que existe de fato. Sem isto, um tenant que ainda
      // não rodou scripts/migrate-menu-flags.js quebraria ao salvar a chave
      // de Vendas ou Financeiro.
      const { rows: cols } = await client.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = 't_configuracoes_tenant'`,
        [tenant.schemaName]
      )
      const existe = new Set(cols.map((c: any) => c.column_name))

      // PADRÃO CRÍTICO: raw SQL UPDATE individual por campo
      const updates: [string, any][] = [
        ['comandas_ativo',           body.comandasAtivo],
        ['producao_ativo',           body.producaoAtivo],
        ['estoque_ativo',            body.estoqueAtivo],
        ['fiscal_ativo',             body.fiscalAtivo],
        ['turno_caixa_ativo',        body.turnoCaixaAtivo],
        ['qtd_caixas',               body.qtdCaixas],
        ['regime_turno',             body.regimeTurno],
        // Fiscal — parametrização
        ['crt',                      body.crt],
        ['regime_tributario',        body.regimeTributario],
        ['serie_nfce',               body.serieNfce],
        ['serie_nfe',                body.serieNfe],
        ['credenciado_nfce',         body.credenciadoNfce],
        ['credenciado_nfe',          body.credenciadoNfe],
        ['cnae',                     body.cnae],
        ['mensagem_fiscal',          body.mensagemFiscal],
        ['focus_nfe_token',          body.focusNfeToken != null ? encryptSecret(body.focusNfeToken) : body.focusNfeToken],
        ['focus_nfe_ambiente',       body.focusNfeAmbiente],
        ['consultas_ativo',          body.consultasAtivo],
        ['pedidos_ativo',            body.pedidosAtivo],
        ['plano_acao_ativo',         body.planoAcaoAtivo],
        ['metas_ativo',              body.metasAtivo],
        ['cardapio_ativo',           body.cardapioAtivo],
        // Compras
        ['compras_ativo',            body.comprasAtivo],
        ['modulo_compras_ativo',     body.comprasAtivo],
        // Menus que antes não tinham chave
        ['vendas_ativo',             body.vendasAtivo],
        ['financeiro_ativo',         body.financeiroAtivo],
        // Fidelidade
        ['fidelidade_ativo',         body.fidelidadeAtivo],
        // Financeiro Completo
        ['contas_pagar_ativo',         body.contasPagarAtivo],
        ['contas_receber_ativo',       body.contasReceberAtivo],
        // Aparência
        ['logo_base64', body.logoBase64],
        ['dark_mode',   body.darkMode],
        // Dados da empresa
        ['nome_empresa',        body.nomeEmpresa],
        ['nome_fantasia',       body.nomeFantasia],
        ['cnpj',                body.cnpj],
        ['inscricao_estadual',  body.inscricaoEstadual],
        ['inscricao_municipal', body.inscricaoMunicipal],
        ['telefone',            body.telefone],
        ['email',               body.email],
        ['cep',                 body.cep],
        ['endereco',            body.endereco],
        ['numero',              body.numero],
        ['complemento',         body.complemento],
        ['bairro',              body.bairro],
        ['cidade',              body.cidade],
        ['uf',                  body.uf],
        ['mensagem_cupom',      body.mensagemCupom],
      ]

      // O guarda `existe.has(col)` evita quebrar num tenant que não rodou as
      // migrations. O problema é que ele fazia isso EM SILÊNCIO: o usuário
      // preenchia Nome fantasia, clicava em Salvar, via "salvo com sucesso" e
      // o campo voltava vazio — sem erro em lugar nenhum.
      //
      // Agora o que foi pulado volta na resposta e sai no log do servidor.
      const gravados: string[] = []
      const ignorados: string[] = []

      for (const [col, val] of updates) {
        if (val === undefined) continue
        if (!existe.has(col)) { ignorados.push(col); continue }
        await client.query(
          `UPDATE t_configuracoes_tenant SET ${col} = $1`,
          [val]
        )
        gravados.push(col)
      }

      if (ignorados.length > 0) {
        console.warn(
          `[configuracoes] ${tenant.schemaName}: colunas ausentes em ` +
          `t_configuracoes_tenant, valores NÃO gravados → ${ignorados.join(', ')}. ` +
          `Rode as migrations correspondentes (ex.: scripts/migrate-empresa-dados.js).`
        )
      }

      return ok({ updated: true, gravados, ignorados })
    } finally { client.release() }
  } catch (err) { return serverError(err) }
}