import { sql } from 'drizzle-orm'
import type { AppDB } from '@/lib/db/connection'

/**
 * Converte a quantidade da ficha técnica para a unidade de estoque do insumo.
 *
 * Exemplos:
 *   ficha: 160g, estoque: kg  → 160 / 1000 = 0.16
 *   ficha: 10ml, estoque: l   → 10 / 1000  = 0.01
 *   ficha: 1un, estoque: un   → 1 (sem conversão)
 *   ficha: 1000un, estoque: un → 1000 (ex: pacote com 1000 embalagens → usa 1 → resta 999)
 *
 * Regras de conversão suportadas:
 *   g  → kg  : ÷ 1000
 *   kg → g   : × 1000
 *   ml → l   : ÷ 1000
 *   l  → ml  : × 1000
 *   mg → g   : ÷ 1000
 *   mg → kg  : ÷ 1000000
 *   Mesma unidade: sem conversão
 */
function converterUnidade(
  quantidade: number,
  unidadeFicha: string,
  unidadeEstoque: string,
): number {
  const f = unidadeFicha.toLowerCase().trim()
  const e = unidadeEstoque.toLowerCase().trim()

  if (f === e) return quantidade

  // Massa
  if (f === 'g'  && e === 'kg') return quantidade / 1000
  if (f === 'kg' && e === 'g')  return quantidade * 1000
  if (f === 'mg' && e === 'g')  return quantidade / 1000
  if (f === 'mg' && e === 'kg') return quantidade / 1_000_000

  // Volume
  if (f === 'ml' && e === 'l')  return quantidade / 1000
  if (f === 'l'  && e === 'ml') return quantidade * 1000
  if (f === 'cl' && e === 'l')  return quantidade / 100
  if (f === 'l'  && e === 'cl') return quantidade * 100

  // Unidades — ex: ficha diz "0.5un" (meia embalagem por produto).
  // Se estoque é em pacote com 1000 unidades, o usuário deve ter cadastrado
  // a ficha em "un" e o estoque também em "un" (1un no estoque = 1 peça).
  // Não há conversão automática entre "un" e "pct" porque não sabemos quantas
  // peças tem um pacote sem o usuário informar.

  // Unidades não conversíveis — retorna sem conversão e loga aviso
  console.warn(
    `[DebitoInsumoService] conversão não suportada: ${f} → ${e}. ` +
    `Usando quantidade sem conversão. Verifique a ficha técnica.`
  )
  return quantidade
}

export class DebitoInsumoService {
  constructor(private db: AppDB) {}

  async simular(produtoId: number, quantidade: number) {
    const fichaRes = await this.db.execute(sql`
      SELECT
        pi.insumo_id,
        pi.quantidade     AS qtd_por_unidade_ficha,
        pi.unidade        AS unidade_ficha,
        i.nome,
        i.unidade         AS unidade_estoque,
        i.estoque_atual
      FROM t_produto_insumo pi
      JOIN t_insumo i
        ON i.insumo_id = pi.insumo_id
       AND i.active_flg = true
      WHERE pi.produto_id = ${produtoId}
        AND pi.active_flg = true
    `)

    return (fichaRes.rows as any[]).map(item => {
      const qtdFichaPorUnidade = Number(item.qtd_por_unidade_ficha)
      const unidadeFicha       = String(item.unidade_ficha ?? item.unidade_estoque)
      const unidadeEstoque     = String(item.unidade_estoque)
      const estoqueAtual       = Number(item.estoque_atual)

      // Converte a quantidade da ficha para a mesma unidade do estoque
      const qtdPorUnidadeConvertida = converterUnidade(
        qtdFichaPorUnidade,
        unidadeFicha,
        unidadeEstoque,
      )

      // Quanto será debitado no total para `quantidade` unidades produzidas
      const qtdTotalDebitar = qtdPorUnidadeConvertida * quantidade
      const estoqueRestante = estoqueAtual - qtdTotalDebitar

      return {
        insumoId:                item.insumo_id,
        nome:                    item.nome,
        unidadeFicha,
        unidadeEstoque,
        qtdFichaPorUnidade,
        qtdPorUnidadeConvertida,
        qtdTotalDebitar,
        estoqueAtual,
        estoqueRestante,
        insuficiente:            estoqueAtual < qtdTotalDebitar,
      }
    })
  }

  async debitar(produtoId: number, quantidade: number, userId: number) {
    if (quantidade <= 0) return { itens: [], teveInsuficiencia: false }

    const simulacao = await this.simular(produtoId, quantidade)
    const now = new Date()

    for (const item of simulacao) {
      // Nunca deixa o estoque ir abaixo de zero.
      // Round para 4 casas decimais para preservar precisão em kg/l
      // sem acumular lixo de ponto flutuante.
      const novoEstoque = Math.max(0, parseFloat(item.estoqueRestante.toFixed(4)))

      await this.db.execute(sql`
        UPDATE t_insumo
        SET estoque_atual = ${novoEstoque},
            updated_dt   = ${now},
            updated_by   = ${userId}
        WHERE insumo_id = ${item.insumoId}
      `)
    }

    return {
      itens: simulacao,
      teveInsuficiencia: simulacao.some(i => i.insuficiente),
    }
  }
}