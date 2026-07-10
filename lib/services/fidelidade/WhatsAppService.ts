// lib/services/fidelidade/WhatsAppService.ts
//
// Envio de mensagens via WhatsApp Cloud API (Meta). Fora do horário comercial
// o WhatsApp Business exige TEMPLATE aprovado para iniciar conversa — por isso
// enviamos sempre um template (não texto livre).
//
// O template aprovado na Meta deve ter DOIS parâmetros no corpo, na ordem:
//   {{1}} = nome do cliente
//   {{2}} = saldo de cashback formatado (ex.: "R$ 12,50")
//
// Config necessária (na tela Fidelidade → WhatsApp):
//   - Phone Number ID
//   - Token da Meta (guardado cifrado; passado aqui já decifrado)
//   - Nome do template + idioma (ex.: pt_BR)

const GRAPH_VERSION = 'v20.0'

/** Normaliza telefone BR para o formato E.164 sem '+': 55 + DDD + número. */
export function normalizarTelefone(raw: string): string | null {
  if (!raw) return null
  let d = String(raw).replace(/\D/g, '')
  if (!d) return null
  // Remove zeros à esquerda
  d = d.replace(/^0+/, '')
  // Já tem DDI 55?
  if (d.startsWith('55') && d.length >= 12) return d
  // 10 (fixo) ou 11 (celular) dígitos = DDD + número → prefixa 55
  if (d.length === 10 || d.length === 11) return '55' + d
  // Fallback: se tiver 12-13 dígitos assume que já tem DDI
  if (d.length >= 12) return d
  return null
}

export interface EnvioResultado {
  ok:         boolean
  messageId?: string
  erro?:      string
}

export async function enviarTemplate({
  phoneNumberId, token, template, idioma, telefone, nome, saldoFormatado,
}: {
  phoneNumberId:  string
  token:          string
  template:       string
  idioma:         string
  telefone:       string
  nome:           string
  saldoFormatado: string
}): Promise<EnvioResultado> {
  const to = normalizarTelefone(telefone)
  if (!to) return { ok: false, erro: 'Telefone inválido' }
  if (!phoneNumberId || !token || !template) return { ok: false, erro: 'WhatsApp não configurado' }

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`
  const body = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: template,
      language: { code: idioma || 'pt_BR' },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: nome || 'Cliente' },
            { type: 'text', text: saldoFormatado },
          ],
        },
      ],
    },
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const msg = data?.error?.message ?? `Erro HTTP ${res.status}`
      return { ok: false, erro: msg }
    }
    const messageId = data?.messages?.[0]?.id
    return { ok: true, messageId }
  } catch (err: any) {
    return { ok: false, erro: err?.message ?? 'Falha de rede ao chamar a Meta' }
  }
}