// lib/services/fidelidade/ReativacaoService.ts
//
// Reativação de clientes inativos com saldo de cashback, via WhatsApp (Meta).
// Regras (dias de inatividade, saldo mínimo, repetição, máx. de avisos, janela
// de horário) vêm de t_fidelidade_config. Cada envio é registrado em
// t_fidelidade_aviso para servir de trava anti-spam.
import { sql } from 'drizzle-orm'
import type { AppDB } from '@/lib/db/connection'
import { CashbackService, type FidelidadeConfig } from '@/lib/services/fidelidade/CashbackService'
import { enviarTemplate, normalizarTelefone } from '@/lib/services/fidelidade/WhatsAppService'
import { decryptSecret, isEncKeyConfigured } from '@/lib/crypto/secretBox'
import { fmtMoeda as fmt } from '@/lib/format'



const SINAL_SQL = `
  CASE
    WHEN tipo = 'credito' AND (expira_em IS NULL OR expira_em >= NOW()) THEN valor_centavos
    WHEN tipo IN ('estorno','ajuste')                                   THEN valor_centavos
    WHEN tipo IN ('uso','expiracao','estorno_credito')                  THEN -valor_centavos
    ELSE 0
  END
`

export interface Candidato {
  clienteId:    number
  nome:         string
  telefone:     string
  saldo:        number
  ultimaCompra: string | null
  sequencia:    number
}

export class ReativacaoService {
  constructor(private db: AppDB) {}

  async getConfigCompleta(): Promise<{ cfg: FidelidadeConfig | null; tokenCipher: string | null }> {
    const cash = new CashbackService(this.db)
    const cfg  = await cash.getConfig()
    const res  = await this.db.execute(sql`SELECT wa_token_cipher FROM t_fidelidade_config ORDER BY config_id LIMIT 1`)
    const tokenCipher = (res.rows[0] as any)?.wa_token_cipher ?? null
    return { cfg, tokenCipher }
  }

  dentroDoHorario(cfg: FidelidadeConfig): boolean {
    // Hora atual no fuso de São Paulo
    const agora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
    const h = agora.getHours()
    return h >= cfg.horarioInicio && h < cfg.horarioFim
  }

  /**
   * Retorna clientes elegíveis para receber aviso agora, já aplicando saldo
   * mínimo, inatividade, repetição e máximo de avisos por ciclo.
   */
  async getCandidatos(cfg: FidelidadeConfig, limite = 500): Promise<Candidato[]> {
    // Clientes com saldo suficiente + inativos há X dias + com telefone.
    const res = await this.db.execute(sql`
      WITH saldos AS (
        SELECT cliente_id, SUM(${sql.raw(SINAL_SQL)}) AS saldo
        FROM t_fidelidade_movimento WHERE active_flg = true
        GROUP BY cliente_id
      )
      SELECT s.cliente_id, c.nome_completo, c.telefone, c.celular, s.saldo::bigint AS saldo,
             (SELECT MAX(vendida_em) FROM t_venda v WHERE v.cliente_id = s.cliente_id AND v.active_flg = true) AS ultima_compra
      FROM saldos s
      JOIN t_cliente c ON c.cliente_id = s.cliente_id AND c.active_flg = true
      WHERE s.saldo >= ${cfg.saldoMinimoAvisoCentavos}
        AND s.saldo > 0
        AND (c.telefone IS NOT NULL OR c.celular IS NOT NULL)
      ORDER BY s.saldo DESC
      LIMIT ${limite}
    `)

    const candidatos: Candidato[] = []
    const hoje = new Date()

    for (const r of res.rows as any[]) {
      const telefone = normalizarTelefone(r.telefone ?? r.celular ?? '')
      if (!telefone) continue

      const ultimaCompra: Date | null = r.ultima_compra ? new Date(r.ultima_compra) : null
      if (!ultimaCompra) continue // nunca comprou → sem baseline de inatividade

      const diasInativo = Math.floor((hoje.getTime() - ultimaCompra.getTime()) / 86400000)
      if (diasInativo < cfg.diasInatividade) continue

      // Avisos já enviados depois da última compra (ciclo atual)
      const avisosRes = await this.db.execute(sql`
        SELECT enviado_em FROM t_fidelidade_aviso
        WHERE cliente_id = ${r.cliente_id} AND status = 'enviado' AND active_flg = true
          AND (enviado_em IS NULL OR enviado_em > ${ultimaCompra.toISOString()})
        ORDER BY enviado_em DESC
      `)
      const avisos = avisosRes.rows as any[]
      const qtdCiclo = avisos.length

      if (qtdCiclo > 0) {
        if (!cfg.repetirAviso) continue
        if (cfg.maxAvisos > 0 && qtdCiclo >= cfg.maxAvisos) continue
        const ultimo = avisos[0]?.enviado_em ? new Date(avisos[0].enviado_em) : null
        if (ultimo) {
          const diasDesdeUltimo = Math.floor((hoje.getTime() - ultimo.getTime()) / 86400000)
          if (diasDesdeUltimo < cfg.intervaloRepeticaoDias) continue
        }
      }

      candidatos.push({
        clienteId:    r.cliente_id,
        nome:         r.nome_completo ?? 'Cliente',
        telefone,
        saldo:        Number(r.saldo ?? 0),
        ultimaCompra: r.ultima_compra ?? null,
        sequencia:    qtdCiclo + 1,
      })
    }

    return candidatos
  }

  /**
   * Envia aviso para uma lista de candidatos e registra cada um em
   * t_fidelidade_aviso. Retorna resumo { enviados, erros }.
   */
  async enviar(cfg: FidelidadeConfig, tokenCipher: string | null, candidatos: Candidato[]): Promise<{ enviados: number; erros: number; detalhes: any[] }> {
    let enviados = 0
    let erros = 0
    const detalhes: any[] = []

    if (!isEncKeyConfigured() || !tokenCipher) {
      // Sem token não dá pra enviar; registra erro por candidato pra ficar visível.
      for (const c of candidatos) {
        await this.logAviso(c, null, 'erro', 'Token da Meta não configurado')
        erros++
        detalhes.push({ clienteId: c.clienteId, nome: c.nome, ok: false, erro: 'Token não configurado' })
      }
      return { enviados, erros, detalhes }
    }

    let token = ''
    try { token = decryptSecret(tokenCipher) } catch { token = '' }
    if (!token) {
      for (const c of candidatos) {
        await this.logAviso(c, null, 'erro', 'Falha ao decifrar token')
        erros++
      }
      return { enviados, erros, detalhes }
    }

    for (const c of candidatos) {
      const r = await enviarTemplate({
        phoneNumberId:  cfg.waPhoneNumberId ?? '',
        token,
        template:       cfg.waTemplateNome ?? '',
        idioma:         cfg.waTemplateIdioma ?? 'pt_BR',
        telefone:       c.telefone,
        nome:           c.nome,
        saldoFormatado: fmt(c.saldo),
      })
      if (r.ok) {
        enviados++
        await this.logAviso(c, r.messageId ?? null, 'enviado', null)
      } else {
        erros++
        await this.logAviso(c, null, 'erro', r.erro ?? 'Erro desconhecido')
      }
      detalhes.push({ clienteId: c.clienteId, nome: c.nome, ok: r.ok, erro: r.erro })
    }

    return { enviados, erros, detalhes }
  }

  private async logAviso(c: Candidato, messageId: string | null, status: 'enviado' | 'erro', erroMsg: string | null) {
    await this.db.execute(sql`
      INSERT INTO t_fidelidade_aviso
        (cliente_id, enviado_em, saldo_no_envio_centavos, sequencia, status, erro_msg, wa_message_id, created_by, updated_by)
      VALUES
        (${c.clienteId}, ${status === 'enviado' ? sql`NOW()` : sql`NULL`}, ${c.saldo}, ${c.sequencia}, ${status}, ${erroMsg}, ${messageId}, 1, 1)
    `)
  }

  async ultimosAvisos(limite = 30) {
    const res = await this.db.execute(sql`
      SELECT a.aviso_id, a.cliente_id, c.nome_completo, a.enviado_em, a.saldo_no_envio_centavos,
             a.sequencia, a.status, a.erro_msg, a.created_dt
      FROM t_fidelidade_aviso a
      LEFT JOIN t_cliente c ON c.cliente_id = a.cliente_id
      WHERE a.active_flg = true
      ORDER BY a.created_dt DESC
      LIMIT ${limite}
    `)
    return (res.rows as any[]).map(r => ({
      avisoId:      r.aviso_id,
      clienteId:    r.cliente_id,
      clienteNome:  r.nome_completo ?? '—',
      enviadoEm:    r.enviado_em,
      saldo:        Number(r.saldo_no_envio_centavos ?? 0),
      sequencia:    r.sequencia,
      status:       r.status,
      erroMsg:      r.erro_msg,
      createdDt:    r.created_dt,
    }))
  }
}