// @ts-nocheck
// app/api/[tenant]/fidelidade/config/route.ts
//
// Configuração do módulo Fidelidade (1 linha por tenant).
// GET  -> devolve os parâmetros em camelCase. NUNCA devolve o token da Meta em
//         claro; devolve só waTokenSet (boolean) pra UI mostrar "configurado".
// PUT  -> faz upsert dos parâmetros. Se vier waToken novo, cifra e guarda;
//         se vier waTokenClear=true, limpa; se não vier nada, mantém o atual.
//
// Unidades nativas (iguais ao resto do ERP): valores em centavos, percentuais
// em basis points (bp): 500 = 5,00%. A tela converte pra exibição.
import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { exigirModulo } from '@/lib/auth/permissoes'
import { pool } from '@/lib/db/connection'
import { ok, serverError, badRequest } from '@/lib/api/responses'
import { encryptSecret, isEncKeyConfigured } from '@/lib/crypto/secretBox'

type Params = { params: { tenant: string } }

const NUM = (v: any, d = 0) => (v === undefined || v === null || v === '' ? d : Number(v))
const BOOL = (v: any, d = false) => (v === undefined || v === null ? d : v === true || v === 'true')

async function garantirLinha(client: any) {
  await client.query(`
    INSERT INTO t_fidelidade_config (config_id)
    SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM t_fidelidade_config)
  `)
}

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    await exigirModulo(tenant.schemaName, 'fidelidade')
    const client = await pool.connect()
    try {
      await client.query(`SET search_path TO "${tenant.schemaName}", public`)
      await garantirLinha(client)
      const res = await client.query(`SELECT * FROM t_fidelidade_config ORDER BY config_id LIMIT 1`)
      const r = res.rows[0]
      const data = {
        configId:                r.config_id,
        programaAtivo:           r.programa_ativo,
        cashbackPctBp:           r.cashback_pct_bp,
        compraMinimaCentavos:    r.compra_minima_centavos,
        validadeDias:            r.validade_dias,
        limiteUsoPctBp:          r.limite_uso_pct_bp,
        saldoMinimoUsoCentavos:  r.saldo_minimo_uso_centavos,
        arredondamento:          r.arredondamento,
        baseCalculo:             r.base_calculo,
        indicacaoAtiva:          r.indicacao_ativa,
        indicacaoPctBp:          r.indicacao_pct_bp,
        reativacaoAtiva:         r.reativacao_ativa,
        diasInatividade:         r.dias_inatividade,
        repetirAviso:            r.repetir_aviso,
        intervaloRepeticaoDias:  r.intervalo_repeticao_dias,
        maxAvisos:               r.max_avisos,
        saldoMinimoAvisoCentavos: r.saldo_minimo_aviso_centavos,
        horarioInicio:           r.horario_inicio,
        horarioFim:              r.horario_fim,
        waPhoneNumberId:         r.wa_phone_number_id,
        waBusinessAccountId:     r.wa_business_account_id,
        waTemplateNome:          r.wa_template_nome,
        waTemplateIdioma:        r.wa_template_idioma,
        mensagemPadrao:          r.mensagem_padrao,
        exigeOptin:              r.exige_optin,
        // segredos / status (nunca o token em claro)
        waTokenSet:              !!r.wa_token_cipher,
        encKeyConfigurada:       isEncKeyConfigured(),
      }
      return ok({ data })
    } finally { client.release() }
  } catch (err) { return serverError(err) }
}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    await exigirModulo(tenant.schemaName, 'fidelidade')
    const b = await req.json()

    // Validações básicas
    if (NUM(b.cashbackPctBp) < 0 || NUM(b.cashbackPctBp) > 100000) return badRequest('Percentual de cashback inválido')
    if (NUM(b.indicacaoPctBp) < 0 || NUM(b.indicacaoPctBp) > 100000) return badRequest('Percentual de indicação inválido')
    if (NUM(b.limiteUsoPctBp) < 0 || NUM(b.limiteUsoPctBp) > 10000) return badRequest('Limite de uso deve ser entre 0% e 100%')
    if (NUM(b.horarioInicio) < 0 || NUM(b.horarioInicio) > 23 || NUM(b.horarioFim) < 0 || NUM(b.horarioFim) > 23) return badRequest('Horário de envio inválido')

    // Se vai guardar um token novo, a chave de criptografia precisa existir.
    const querSalvarToken = typeof b.waToken === 'string' && b.waToken.trim() !== ''
    if (querSalvarToken && !isEncKeyConfigured()) {
      return badRequest('FIDELIDADE_ENC_KEY não configurada no servidor — não é seguro salvar o token.')
    }

    const client = await pool.connect()
    try {
      await client.query(`SET search_path TO "${tenant.schemaName}", public`)
      await garantirLinha(client)

      await client.query(`
        UPDATE t_fidelidade_config SET
          programa_ativo              = $1,
          cashback_pct_bp             = $2,
          compra_minima_centavos      = $3,
          validade_dias               = $4,
          limite_uso_pct_bp           = $5,
          saldo_minimo_uso_centavos   = $6,
          arredondamento              = $7,
          base_calculo                = $8,
          indicacao_ativa             = $9,
          indicacao_pct_bp            = $10,
          reativacao_ativa            = $11,
          dias_inatividade            = $12,
          repetir_aviso               = $13,
          intervalo_repeticao_dias    = $14,
          max_avisos                  = $15,
          saldo_minimo_aviso_centavos = $16,
          horario_inicio              = $17,
          horario_fim                 = $18,
          wa_phone_number_id          = $19,
          wa_business_account_id      = $20,
          wa_template_nome            = $21,
          wa_template_idioma          = $22,
          mensagem_padrao             = $23,
          exige_optin                 = $24,
          modification_num            = modification_num + 1,
          updated_dt                  = NOW(),
          updated_by                  = 1
        WHERE config_id = (SELECT config_id FROM t_fidelidade_config ORDER BY config_id LIMIT 1)
      `, [
        BOOL(b.programaAtivo),
        NUM(b.cashbackPctBp, 500),
        NUM(b.compraMinimaCentavos),
        NUM(b.validadeDias),
        NUM(b.limiteUsoPctBp, 10000),
        NUM(b.saldoMinimoUsoCentavos),
        (b.arredondamento === 'real' ? 'real' : 'centavo'),
        (b.baseCalculo === 'bruto' ? 'bruto' : 'liquido'),
        BOOL(b.indicacaoAtiva),
        NUM(b.indicacaoPctBp, 500),
        BOOL(b.reativacaoAtiva),
        NUM(b.diasInatividade, 30),
        BOOL(b.repetirAviso),
        NUM(b.intervaloRepeticaoDias, 30),
        NUM(b.maxAvisos),
        NUM(b.saldoMinimoAvisoCentavos),
        NUM(b.horarioInicio, 9),
        NUM(b.horarioFim, 20),
        b.waPhoneNumberId?.trim() || null,
        b.waBusinessAccountId?.trim() || null,
        b.waTemplateNome?.trim() || null,
        b.waTemplateIdioma?.trim() || 'pt_BR',
        b.mensagemPadrao?.trim() || null,
        BOOL(b.exigeOptin, true),
      ])

      // Token: cifra e grava só se veio um novo; limpa se pediram.
      if (querSalvarToken) {
        const cipher = encryptSecret(b.waToken.trim())
        await client.query(
          `UPDATE t_fidelidade_config SET wa_token_cipher = $1, updated_dt = NOW()
           WHERE config_id = (SELECT config_id FROM t_fidelidade_config ORDER BY config_id LIMIT 1)`,
          [cipher]
        )
      } else if (b.waTokenClear === true) {
        await client.query(
          `UPDATE t_fidelidade_config SET wa_token_cipher = NULL, updated_dt = NOW()
           WHERE config_id = (SELECT config_id FROM t_fidelidade_config ORDER BY config_id LIMIT 1)`
        )
      }

      return ok({ ok: true })
    } finally { client.release() }
  } catch (err) { return serverError(err) }
}