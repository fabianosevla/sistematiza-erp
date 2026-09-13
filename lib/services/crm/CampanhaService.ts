// lib/services/crm/CampanhaService.ts
//
// Campanha em massa por WhatsApp — reaproveita o MESMO WhatsAppService e o
// MESMO template aprovado que a Reativação da Fidelidade já usa (não existe
// infraestrutura de template novo na Meta pra campanha genérica ainda).
// O template aprovado tem 2 parâmetros fixos ({{1}} nome, {{2}} texto) — a
// mensagem da campanha entra no lugar que a reativação usa pro saldo. Igual
// à reativação: sem credencial da Meta configurada, fica pronta mas não
// dispara — não finge que funciona.
import { sql } from 'drizzle-orm'
import type { AppDB } from '@/lib/db/connection'
import { decryptSecret, isEncKeyConfigured } from '@/lib/crypto/secretBox'
import { enviarTemplate, normalizarTelefone } from '@/lib/services/fidelidade/WhatsAppService'

export class CampanhaService {
  constructor(private db: AppDB) {}

  // t_fidelidade_config não está em allSchemas — mesmo motivo do
  // CashbackService, SQL cru em vez de import tipado da tabela.
  async getConfigWhatsapp() {
    const r = await this.db.execute(sql`
      SELECT wa_phone_number_id, wa_template_nome, wa_template_idioma, wa_token_cipher
        FROM t_fidelidade_config LIMIT 1
    `)
    const cfg: any = (r.rows as any[])[0] ?? {}
    return {
      pronto: !!(cfg.wa_phone_number_id && cfg.wa_template_nome && cfg.wa_token_cipher && isEncKeyConfigured()),
      phoneNumberId: cfg.wa_phone_number_id ?? null,
      template:      cfg.wa_template_nome ?? null,
      idioma:        cfg.wa_template_idioma ?? 'pt_BR',
      tokenCipher:   cfg.wa_token_cipher ?? null,
    }
  }

  /** Público-alvo: uma lista de { clienteId, nome, telefone } já resolvida por quem chama. */
  async enviar(campanhaNome: string, mensagem: string, publico: { clienteId: number; nome: string; telefone: string | null }[], userId: number) {
    const cfg = await this.getConfigWhatsapp()
    if (!cfg.pronto) {
      throw new Error('WhatsApp ainda não está configurado (Fidelidade → Configuração → WhatsApp). A campanha fica pronta, mas não dispara sem isso.')
    }
    const token = decryptSecret(cfg.tokenCipher!)

    let enviados = 0, erros = 0
    for (const p of publico) {
      const now = new Date()
      if (!p.telefone || !normalizarTelefone(p.telefone)) {
        await this.log(campanhaNome, p.clienteId, 'erro', 'Sem telefone válido', undefined, userId, now)
        erros++
        continue
      }
      const r = await enviarTemplate({
        phoneNumberId: cfg.phoneNumberId!, token, template: cfg.template!, idioma: cfg.idioma,
        telefone: p.telefone, nome: p.nome, saldoFormatado: mensagem,
      })
      await this.log(campanhaNome, p.clienteId, r.ok ? 'enviado' : 'erro', r.erro, r.messageId, userId, now)
      if (r.ok) enviados++; else erros++
    }
    return { enviados, erros, total: publico.length }
  }

  private async log(campanhaNome: string, clienteId: number, status: string, erroMsg: string | undefined, waMessageId: string | undefined, userId: number, now: Date) {
    await this.db.execute(sql`
      INSERT INTO t_crm_campanha_envio
        (cliente_id, campanha_nome, enviado_em, status, erro_msg, wa_message_id,
         created_by, updated_by, created_dt, updated_dt)
      VALUES (${clienteId}, ${campanhaNome}, ${now}, ${status}, ${erroMsg ?? null}, ${waMessageId ?? null},
              ${userId}, ${userId}, ${now}, ${now})
    `)
  }

  async ultimosEnvios(limite = 50) {
    const r = await this.db.execute(sql`
      SELECT e.envio_id, e.campanha_nome, e.enviado_em, e.status, e.erro_msg, c.nome_completo AS cliente_nome
        FROM t_crm_campanha_envio e
        LEFT JOIN t_cliente c ON c.cliente_id = e.cliente_id
       WHERE e.active_flg = true
       ORDER BY e.enviado_em DESC NULLS LAST
       LIMIT ${limite}
    `)
    return (r.rows as any[]).map(row => ({
      envioId: row.envio_id, campanhaNome: row.campanha_nome, enviadoEm: row.enviado_em,
      status: row.status, erroMsg: row.erro_msg, clienteNome: row.cliente_nome,
    }))
  }
}
