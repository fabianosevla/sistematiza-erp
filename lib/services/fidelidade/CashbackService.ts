// lib/services/fidelidade/CashbackService.ts
//
// Motor de cashback do módulo Fidelidade. NÃO depende dos schemas Drizzle
// (as tabelas de fidelidade não estão registradas em allSchemas), então usa
// SQL cru via db.execute(sql`...`) — a conexão já vem com o search_path do
// tenant correto (getDbForTenant).
//
// Convenção de SALDO (t_fidelidade_movimento.valor_centavos é SEMPRE positivo;
// o "tipo" define o sinal):
//   credito         → +  (cashback ganho numa venda)
//   estorno         → +  (devolução de saldo usado, ex.: venda cancelada)
//   ajuste          → +  (ajuste manual a crédito)
//   uso             → -  (saldo gasto numa compra)
//   expiracao       → -  (saldo que expirou)
//   estorno_credito → -  (remoção de um crédito, ex.: venda que gerou cashback foi cancelada)
//
// Crédito expirado (expira_em < now) não conta no saldo.
import { sql } from 'drizzle-orm'
import type { AppDB } from '@/lib/db/connection'

export interface FidelidadeConfig {
  configId:                number
  programaAtivo:           boolean
  cashbackPctBp:           number
  compraMinimaCentavos:    number
  validadeDias:            number
  limiteUsoPctBp:          number
  saldoMinimoUsoCentavos:  number
  arredondamento:          'centavo' | 'real'
  baseCalculo:             'bruto' | 'liquido'
  reativacaoAtiva:         boolean
  diasInatividade:         number
  repetirAviso:            boolean
  intervaloRepeticaoDias:  number
  maxAvisos:               number
  saldoMinimoAvisoCentavos: number
  horarioInicio:           number
  horarioFim:              number
  waPhoneNumberId:         string | null
  waBusinessAccountId:     string | null
  waTemplateNome:          string | null
  waTemplateIdioma:        string
  mensagemPadrao:          string | null
  exigeOptin:              boolean
  waTokenSet:              boolean
}

function arredondar(valor: number, modo: 'centavo' | 'real'): number {
  if (modo === 'real') return Math.round(valor / 100) * 100
  return Math.round(valor)
}

export class CashbackService {
  constructor(private db: AppDB) {}

  async getConfig(): Promise<FidelidadeConfig | null> {
    // Garante 1 linha (o mesmo que a rota de config faz)
    await this.db.execute(sql`
      INSERT INTO t_fidelidade_config (config_id)
      SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM t_fidelidade_config)
    `)
    const res = await this.db.execute(sql`SELECT * FROM t_fidelidade_config ORDER BY config_id LIMIT 1`)
    const r: any = res.rows[0]
    if (!r) return null
    return {
      configId:                r.config_id,
      programaAtivo:           r.programa_ativo === true,
      cashbackPctBp:           Number(r.cashback_pct_bp ?? 0),
      compraMinimaCentavos:    Number(r.compra_minima_centavos ?? 0),
      validadeDias:            Number(r.validade_dias ?? 0),
      limiteUsoPctBp:          Number(r.limite_uso_pct_bp ?? 10000),
      saldoMinimoUsoCentavos:  Number(r.saldo_minimo_uso_centavos ?? 0),
      arredondamento:          r.arredondamento === 'real' ? 'real' : 'centavo',
      baseCalculo:             r.base_calculo === 'bruto' ? 'bruto' : 'liquido',
      reativacaoAtiva:         r.reativacao_ativa === true,
      diasInatividade:         Number(r.dias_inatividade ?? 30),
      repetirAviso:            r.repetir_aviso === true,
      intervaloRepeticaoDias:  Number(r.intervalo_repeticao_dias ?? 30),
      maxAvisos:               Number(r.max_avisos ?? 0),
      saldoMinimoAvisoCentavos: Number(r.saldo_minimo_aviso_centavos ?? 0),
      horarioInicio:           Number(r.horario_inicio ?? 9),
      horarioFim:              Number(r.horario_fim ?? 20),
      waPhoneNumberId:         r.wa_phone_number_id ?? null,
      waBusinessAccountId:     r.wa_business_account_id ?? null,
      waTemplateNome:          r.wa_template_nome ?? null,
      waTemplateIdioma:        r.wa_template_idioma ?? 'pt_BR',
      mensagemPadrao:          r.mensagem_padrao ?? null,
      exigeOptin:              r.exige_optin !== false,
      waTokenSet:              !!r.wa_token_cipher,
    }
  }

  /** Saldo atual de cashback de um cliente, em centavos. */
  async getSaldo(clienteId: number): Promise<number> {
    const res = await this.db.execute(sql`
      SELECT COALESCE(SUM(
        CASE
          WHEN tipo = 'credito' AND (expira_em IS NULL OR expira_em >= NOW()) THEN valor_centavos
          WHEN tipo IN ('estorno','ajuste')                                   THEN valor_centavos
          WHEN tipo IN ('uso','expiracao','estorno_credito')                  THEN -valor_centavos
          ELSE 0
        END
      ), 0)::bigint AS saldo
      FROM t_fidelidade_movimento
      WHERE cliente_id = ${clienteId} AND active_flg = true
    `)
    return Number((res.rows[0] as any)?.saldo ?? 0)
  }

  /**
   * Credita cashback pela venda. Silencioso: se o programa estiver inativo,
   * sem cliente, ou compra abaixo da mínima, não faz nada e retorna 0.
   * base "liquido" = total já com desconto MENOS o que foi pago em cashback.
   */
  async creditar({ clienteId, vendaId, subtotal, total, cashbackUsado = 0, userId = 1 }: {
    clienteId?: number | null
    vendaId:    number
    subtotal:   number
    total:      number
    cashbackUsado?: number
    userId?:    number
  }): Promise<number> {
    if (!clienteId) return 0
    const cfg = await this.getConfig()
    if (!cfg || !cfg.programaAtivo || cfg.cashbackPctBp <= 0) return 0
    if (total < cfg.compraMinimaCentavos) return 0

    const base = cfg.baseCalculo === 'bruto'
      ? subtotal
      : Math.max(0, total - cashbackUsado)

    const bruto = base * (cfg.cashbackPctBp / 10000)
    const valor = arredondar(bruto, cfg.arredondamento)
    if (valor <= 0) return 0

    const expira = cfg.validadeDias > 0
      ? sql`NOW() + (${cfg.validadeDias} || ' days')::interval`
      : sql`NULL`

    await this.db.execute(sql`
      INSERT INTO t_fidelidade_movimento
        (cliente_id, tipo, valor_centavos, venda_id, expira_em, observacao, created_by, updated_by)
      VALUES
        (${clienteId}, 'credito', ${valor}, ${vendaId}, ${expira}, ${'Cashback da venda #' + vendaId}, ${userId}, ${userId})
    `)
    return valor
  }

  /**
   * Usa (resgata) saldo do cliente numa venda. Respeita saldo disponível,
   * limite de uso por venda (% do total) e saldo mínimo pra usar.
   * Retorna quanto foi efetivamente usado (centavos). Silencioso em qualquer
   * condição inválida (retorna 0).
   */
  async usar({ clienteId, vendaId, total, solicitado, userId = 1 }: {
    clienteId?: number | null
    vendaId:    number
    total:      number
    solicitado: number
    userId?:    number
  }): Promise<number> {
    if (!clienteId || solicitado <= 0) return 0
    const cfg = await this.getConfig()
    if (!cfg || !cfg.programaAtivo) return 0

    const saldo = await this.getSaldo(clienteId)
    if (saldo < cfg.saldoMinimoUsoCentavos) return 0
    if (saldo <= 0) return 0

    const limitePorVenda = Math.floor(total * (cfg.limiteUsoPctBp / 10000))
    const valorUsar = Math.max(0, Math.min(solicitado, saldo, limitePorVenda, total))
    if (valorUsar <= 0) return 0

    await this.db.execute(sql`
      INSERT INTO t_fidelidade_movimento
        (cliente_id, tipo, valor_centavos, venda_id, observacao, created_by, updated_by)
      VALUES
        (${clienteId}, 'uso', ${valorUsar}, ${vendaId}, ${'Uso de cashback na venda #' + vendaId}, ${userId}, ${userId})
    `)
    return valorUsar
  }

  /**
   * Estorna toda a movimentação de cashback de uma venda (ao cancelar/excluir):
   *  - cada 'credito' vira 'estorno_credito' (remove o crédito)
   *  - cada 'uso'     vira 'estorno'         (devolve o saldo ao cliente)
   * Idempotente por checar se já existe estorno referenciando a venda.
   */
  async estornarVenda(vendaId: number, userId = 1): Promise<void> {
    const mov = await this.db.execute(sql`
      SELECT movimento_id, cliente_id, tipo, valor_centavos
      FROM t_fidelidade_movimento
      WHERE venda_id = ${vendaId} AND active_flg = true
        AND tipo IN ('credito','uso')
    `)
    for (const row of mov.rows as any[]) {
      // Evita estorno duplicado
      const jaEstornado = await this.db.execute(sql`
        SELECT 1 FROM t_fidelidade_movimento
        WHERE venda_id = ${vendaId} AND active_flg = true
          AND tipo IN ('estorno','estorno_credito')
          AND cliente_id = ${row.cliente_id}
          AND valor_centavos = ${row.valor_centavos}
        LIMIT 1
      `)
      if (jaEstornado.rows.length > 0) continue

      const tipoEstorno = row.tipo === 'credito' ? 'estorno_credito' : 'estorno'
      await this.db.execute(sql`
        INSERT INTO t_fidelidade_movimento
          (cliente_id, tipo, valor_centavos, venda_id, observacao, created_by, updated_by)
        VALUES
          (${row.cliente_id}, ${tipoEstorno}, ${row.valor_centavos}, ${vendaId},
           ${'Estorno da venda #' + vendaId}, ${userId}, ${userId})
      `)
    }
  }
}