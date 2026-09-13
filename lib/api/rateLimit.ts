// lib/api/rateLimit.ts
//
// Limite de requisições por IP, pra rota pública sem login (cardápio online
// hoje é a única). Guarda em memória — cada instância serverless tem a sua,
// e reseta em cold start. Não é à prova de ataque distribuído de verdade,
// mas resolve o caso real: um script batendo na mesma rota repetidamente.
// Se um dia isso não bastar mais (mais tenants, ataque de verdade), o
// próximo passo é um contador compartilhado (Redis/Upstash) — não vale a
// complexidade agora, pra 1 rota pública de baixo volume.
//
// Chave por IP + rota, janela deslizante simples (guarda os timestamps das
// últimas requisições e conta quantas caem dentro da janela).

const janelas = new Map<string, number[]>()

// Limpeza periódica — sem isso, IP que aparece uma vez fica pra sempre no
// mapa. Roda a cada limpeza a cada N chamadas, não com setInterval (setInterval
// não convém em função serverless, que pode ser encerrada a qualquer momento).
let chamadasDesdeLimpeza = 0
function limparAntigos(agora: number, janelaMs: number) {
  chamadasDesdeLimpeza++
  if (chamadasDesdeLimpeza < 200) return
  chamadasDesdeLimpeza = 0
  for (const [chave, timestamps] of janelas) {
    const validos = timestamps.filter(t => agora - t < janelaMs)
    if (validos.length === 0) janelas.delete(chave)
    else janelas.set(chave, validos)
  }
}

function ipDoRequest(req: Request): string {
  // Vercel sempre popula x-forwarded-for. Sem ele (dev local, teste), cai
  // num valor fixo — rate limit vira "por processo" em vez de "por IP", mas
  // não quebra a rota.
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return req.headers.get('x-real-ip') ?? 'desconhecido'
}

/**
 * Verifica e registra uma chamada. `escopo` separa rotas diferentes (mesmo
 * IP não compartilha limite entre GET do cardápio e POST da mensagem).
 */
export function checarLimite(
  req: Request,
  escopo: string,
  { limite, janelaMs }: { limite: number; janelaMs: number },
): { permitido: boolean; restante: number } {
  const agora = Date.now()
  limparAntigos(agora, janelaMs)

  const chave = `${escopo}:${ipDoRequest(req)}`
  const timestamps = (janelas.get(chave) ?? []).filter(t => agora - t < janelaMs)

  if (timestamps.length >= limite) {
    janelas.set(chave, timestamps)
    return { permitido: false, restante: 0 }
  }

  timestamps.push(agora)
  janelas.set(chave, timestamps)
  return { permitido: true, restante: limite - timestamps.length }
}
