/**
 * lib/format.ts
 * Formatação de exibição — fonte única.
 *
 * Regras do projeto que este arquivo materializa:
 *  - dinheiro é SEMPRE inteiro em centavos; a divisão por 100 acontece só aqui
 *  - datas vindas do banco podem ser 'AAAA-MM-DD' ou ISO completo; nenhuma das
 *    duas pode sofrer conversão de fuso na exibição (era o bug do "um dia a menos")
 *  - valor ausente vira travessão, nunca "NaN" ou "Invalid Date"
 */

const TRACO = '—'

// ── Dinheiro ────────────────────────────────────────────────────────────────

/** Centavos → "R$ 1.234,56" */
export function fmtMoeda(centavos: any): string {
  const n = Number(centavos ?? 0)
  if (!Number.isFinite(n)) return TRACO
  return (n / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/** Centavos → "1234.56" para preencher <input type="number">. Zero vira ''. */
export function fmtMoedaInput(centavos: any): string {
  const n = Number(centavos ?? 0)
  return Number.isFinite(n) && n > 0 ? (n / 100).toFixed(2) : ''
}

/** "1.234,56" ou "1234.56" → 123456 (centavos). Vazio vira 0. */
export function parseMoeda(texto: any): number {
  if (texto === null || texto === undefined || texto === '') return 0
  const limpo = String(texto).trim().replace(/\s/g, '').replace(/R\$/i, '')
  // Se tem vírgula, ela é o separador decimal e o ponto é milhar
  const normalizado = limpo.includes(',')
    ? limpo.replace(/\./g, '').replace(',', '.')
    : limpo
  const n = parseFloat(normalizado)
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}

// ── Datas ───────────────────────────────────────────────────────────────────

/**
 * Lê o dia/mês/ano SEM passar por fuso horário.
 * Aceita 'AAAA-MM-DD', ISO completo, Date e timestamp.
 */
function partesDaData(valor: any): { d: string; m: string; a: string; hora: string } | null {
  if (valor === null || valor === undefined || valor === '') return null

  if (valor instanceof Date) {
    if (isNaN(valor.getTime())) return null
    return {
      d: String(valor.getDate()).padStart(2, '0'),
      m: String(valor.getMonth() + 1).padStart(2, '0'),
      a: String(valor.getFullYear()),
      hora: `${String(valor.getHours()).padStart(2, '0')}:${String(valor.getMinutes()).padStart(2, '0')}`,
    }
  }

  const s = String(valor)
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/)
  if (m) {
    return { a: m[1], m: m[2], d: m[3], hora: m[4] ? `${m[4]}:${m[5]}` : '' }
  }

  const dt = new Date(s)
  if (isNaN(dt.getTime())) return null
  return {
    d: String(dt.getDate()).padStart(2, '0'),
    m: String(dt.getMonth() + 1).padStart(2, '0'),
    a: String(dt.getFullYear()),
    hora: `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`,
  }
}

/** → "27/07/2026" */
export function fmtData(valor: any): string {
  const p = partesDaData(valor)
  return p ? `${p.d}/${p.m}/${p.a}` : TRACO
}

/** → "27/07/2026 14:35" */
export function fmtDataHora(valor: any): string {
  const p = partesDaData(valor)
  if (!p) return TRACO
  return p.hora ? `${p.d}/${p.m}/${p.a} ${p.hora}` : `${p.d}/${p.m}/${p.a}`
}

/** → "27/07" */
export function fmtDataCurta(valor: any): string {
  const p = partesDaData(valor)
  return p ? `${p.d}/${p.m}` : TRACO
}

/** → "2026-07-27", para <input type="date"> */
export function toInputDate(valor: any): string {
  const p = partesDaData(valor)
  return p ? `${p.a}-${p.m}-${p.d}` : ''
}

// ── Datas COM fuso (momentos) ───────────────────────────────────────────────
//
// As funções acima são para DATA PURA: vencimento, entrega, competência —
// dias de calendário, que não podem mudar por causa do fuso do navegador.
//
// As duas abaixo são para MOMENTO: quando a venda aconteceu, quando o
// cashback foi creditado. Aí o fuso importa: uma venda registrada às 22h em
// Passos deve aparecer como 22h, e é o navegador quem sabe disso.

/** Momento → "27/07/2026", já convertido para o fuso do navegador. */
export function fmtDataLocal(valor: any): string {
  if (valor === null || valor === undefined || valor === '') return TRACO
  const d = valor instanceof Date ? valor : new Date(String(valor))
  return isNaN(d.getTime()) ? TRACO : d.toLocaleDateString('pt-BR')
}

/** Momento → "27/07/2026 14:35", no fuso do navegador. */
export function fmtDataHoraLocal(valor: any): string {
  if (valor === null || valor === undefined || valor === '') return TRACO
  const d = valor instanceof Date ? valor : new Date(String(valor))
  if (isNaN(d.getTime())) return TRACO
  return d.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// ── Números ─────────────────────────────────────────────────────────────────

/**
 * Quantidade.
 *
 * A versão anterior forçava no mínimo 3 casas decimais E usava ponto como
 * separador: 50 unidades saíam como "50.000". Em português isso se lê
 * cinquenta mil — o operador via o estoque inflado em mil vezes na tela.
 *
 * Agora:
 *   • número inteiro sai inteiro          → 50 vira "50"
 *   • fração só aparece se existir        → 0.5 vira "0,5"
 *   • separador é vírgula, e o milhar tem ponto, como manda o pt-BR
 *   • insumo em fração mínima continua legível → 0.00027 vira "0,00027"
 *
 * O segundo parâmetro é o MÁXIMO de casas. Antes ele era o mínimo — a troca é
 * proposital, e nenhuma chamada do sistema passa esse argumento hoje.
 */
export function fmtQtd(valor: any, casasMax = 6): string {
  const n = parseFloat(String(valor ?? 0).replace(',', '.'))
  if (!Number.isFinite(n)) return '0'
  if (Number.isInteger(n)) return n.toLocaleString('pt-BR')
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: casasMax })
}

/** 12.3456 → "12,3%" */
export function fmtPct(valor: any, casas = 1): string {
  const n = Number(valor ?? 0)
  if (!Number.isFinite(n)) return TRACO
  return `${n.toFixed(casas).replace('.', ',')}%`
}

/** Texto com vírgula ou ponto → número. Vazio vira 0. */
export function parseNumero(texto: any): number {
  if (texto === null || texto === undefined || texto === '') return 0
  const n = parseFloat(String(texto).replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

/** Texto vazio/nulo → travessão. Para células de tabela. */
export function ouTraco(valor: any): string {
  const s = valor === null || valor === undefined ? '' : String(valor).trim()
  return s === '' ? TRACO : s
}