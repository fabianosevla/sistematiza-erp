// lib/filtroColuna.ts
//
// FILTRO DE COLUNA — UMA REGRA SÓ PARA TODAS AS TABELAS (QA #136).
//
// Cada tela filtrava do seu jeito: umas ignoravam acento e outras não, umas
// listavam as opções do funil e outras deixavam a caixa vazia. Aqui fica a
// regra comum, usada pelas telas e pelo funil do DataTable:
//
//   - comparação sem acento, sem cedilha e sem diferenciar maiúsculas
//     ("mucarela" acha "Muçarela");
//   - o valor digitado precisa estar CONTIDO no valor da coluna;
//   - coluna com vários valores por linha (ex.: produtos de uma venda) casa
//     se qualquer um deles casar.

/** "Muçarela de Búfala " → "mucarela de bufala" */
export function normalizarTexto(v: unknown): string {
  return String(v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

/** O valor da coluna (texto ou lista) contém o que foi digitado/escolhido? */
export function casaFiltro(valor: unknown, alvo: string): boolean {
  const procurado = normalizarTexto(alvo)
  if (!procurado) return true
  if (Array.isArray(valor)) return valor.some(v => normalizarTexto(v).includes(procurado))
  return normalizarTexto(valor).includes(procurado)
}

type ValorDe<T> = (item: T, chave: string) => unknown
const valorPadrao: ValorDe<any> = (item, chave) => item?.[chave]

/** Aplica todos os filtros de coluna ativos. Filtro vazio é ignorado. */
export function filtrarPorColunas<T>(
  itens: T[],
  filtros: Record<string, string>,
  valorDe: ValorDe<T> = valorPadrao,
): T[] {
  const ativos = Object.entries(filtros).filter(([, v]) => !!v?.trim())
  if (ativos.length === 0) return itens
  return itens.filter(item => ativos.every(([k, v]) => casaFiltro(valorDe(item, k), v)))
}

/**
 * Opções do funil de cada coluna: os valores distintos que existem no
 * conjunto SEM filtro, em ordem alfabética. Coluna com lista entra item a item.
 */
export function opcoesDasColunas<T>(
  itens: T[],
  chaves: string[],
  valorDe: ValorDe<T> = valorPadrao,
): Record<string, string[]> {
  const mapa: Record<string, string[]> = {}
  for (const k of chaves) {
    const set = new Set<string>()
    for (const item of itens) {
      const v = valorDe(item, k)
      const lista = Array.isArray(v) ? v : [v]
      for (const x of lista) {
        const t = String(x ?? '').trim()
        if (t) set.add(t)
      }
    }
    mapa[k] = Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }
  return mapa
}

/**
 * Listas que o servidor paginava: o filtro de coluna só enxergava a página
 * carregada. Essas telas agora buscam o conjunto inteiro (até este teto) e
 * paginam aqui, depois de filtrar.
 */
export const LIMITE_LISTA_COMPLETA = 10000

/** Fatia a lista já filtrada e devolve a meta no formato do DataTable. */
export function paginarLocal<T>(itens: T[], page: number, limit: number) {
  const total      = itens.length
  const totalPages = Math.max(1, Math.ceil(total / limit))
  const atual      = Math.min(Math.max(1, page), totalPages)
  return {
    pagina: itens.slice((atual - 1) * limit, atual * limit),
    meta:   { page: atual, totalPages, total, limit },
  }
}
