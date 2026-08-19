// ESTE ARQUIVO VAI EM: lib/cardapio/horario.ts
//
// Horário de atendimento do Cardápio Digital (QA #102). Sem horário
// configurado (null), o cardápio fica sempre aberto — é o comportamento de
// antes, preservado pra quem não mexer nessa configuração.
export type DiaHorario = { aberto: boolean; abre: string; fecha: string }
export type HorarioAtendimento = Partial<Record<'dom' | 'seg' | 'ter' | 'qua' | 'qui' | 'sex' | 'sab', DiaHorario>>

const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'] as const

/**
 * Está aberto agora? Hora sempre em America/Sao_Paulo — mesmo critério do
 * resto do sistema pra "hoje"/"agora", nunca o fuso do servidor.
 */
export function estaAberto(horario: HorarioAtendimento | null | undefined): { aberto: boolean; proximaAbertura?: string } {
  if (!horario || Object.keys(horario).length === 0) return { aberto: true }

  const agoraSp = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
  const dia = DIAS[agoraSp.getDay()]
  const cfg = horario[dia]

  if (!cfg || !cfg.aberto) return { aberto: false, proximaAbertura: cfg?.abre }

  const hhmmAgora = `${String(agoraSp.getHours()).padStart(2, '0')}:${String(agoraSp.getMinutes()).padStart(2, '0')}`
  const aberto = hhmmAgora >= cfg.abre && hhmmAgora <= cfg.fecha
  return { aberto, proximaAbertura: aberto ? undefined : cfg.abre }
}
