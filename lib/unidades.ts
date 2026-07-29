/**
 * lib/unidades.ts
 * Conversão de unidades — fonte única.
 *
 * Antes existiam duas cópias desta lógica: DebitoInsumoService.ts e
 * VendaService.ts. Qualquer correção precisava ser feita nos dois lugares,
 * e a segunda cópia trazia até um comentário admitindo a duplicação.
 *
 * Famílias convertíveis: massa (mg/g/kg) e volume (ml/l). Unidades de contagem
 * (un, pct, cx…) não convertem entre si — o valor volta inalterado.
 */

export const FAMILIA_MASSA  = ['mg', 'g', 'kg'] as const
export const FAMILIA_VOLUME = ['ml', 'l'] as const

/** Fator de cada unidade para a unidade base da família (g e ml). */
const FATOR: Record<string, number> = {
  mg: 0.001, g: 1, kg: 1000,
  ml: 1,     l: 1000,
}

function norm(u: any): string {
  return String(u ?? '').toLowerCase().trim()
}

/** Família da unidade, ou null se for unidade de contagem. */
export function familiaDaUnidade(unidade: any): 'massa' | 'volume' | null {
  const u = norm(unidade)
  if ((FAMILIA_MASSA as readonly string[]).includes(u))  return 'massa'
  if ((FAMILIA_VOLUME as readonly string[]).includes(u)) return 'volume'
  return null
}

/** true se as duas unidades podem ser convertidas entre si. */
export function mesmaFamilia(a: any, b: any): boolean {
  const fa = familiaDaUnidade(a)
  return fa !== null && fa === familiaDaUnidade(b)
}

/**
 * Converte uma quantidade entre unidades da mesma família.
 * Unidades iguais, incompatíveis ou desconhecidas devolvem a quantidade
 * original — mesmo comportamento tolerante das versões antigas, para não
 * derrubar débito de estoque por causa de uma unidade não cadastrada.
 */
export function converterUnidade(qtd: number, de: any, para: any): number {
  const f = norm(de)
  const e = norm(para)
  if (f === e) return qtd
  if (!mesmaFamilia(f, e)) return qtd
  const fatorDe   = FATOR[f]
  const fatorPara = FATOR[e]
  if (!fatorDe || !fatorPara) return qtd
  return (qtd * fatorDe) / fatorPara
}

/**
 * Unidades que podem ser digitadas na ficha técnica para um insumo cujo
 * estoque é controlado na unidade informada.
 * Ex.: insumo em kg → aceita kg e g.
 */
export function unidadesCompativeis(unidadeInsumo: any): string[] {
  const u = norm(unidadeInsumo)
  if (u === 'kg' || u === 'g')  return ['kg', 'g']
  if (u === 'l'  || u === 'ml') return ['l', 'ml']
  return [String(unidadeInsumo ?? '')]
}