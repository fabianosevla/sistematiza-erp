import { sql } from 'drizzle-orm'
import type { AppDB } from '@/lib/db/connection'

/**
 * DebitoInsumoService — débito automático de insumos via ficha técnica.
 *
 * Usado quando se ADICIONA estoque de um produto acabado (representa
 * "acabei de fabricar X unidades"): para cada insumo da ficha técnica
 * desse produto, debita (quantidade_da_ficha × quantidade_fabricada)
 * do estoque do insumo correspondente.
 *
 * NÃO debita na venda — na venda, debita-se só o produto acabado
 * (lógica já existente em VendaService).
 */
export class DebitoInsumoService {
  constructor(private db: AppDB) {}

  /**
   * Calcula quanto de cada insumo seria consumido para fabricar
   * `quantidade` unidades do produto — sem aplicar ainda.
   */
  async simular(produtoId: number, quantidade: number) {
    const fichaRes = await this.db.execute(sql`
      SELECT pi.insumo_id, pi.quantidade as qtd_por_unidade, i.nome, i.unidade, i.estoque_atual
      FROM t_produto_insumo pi
      JOIN t_insumo i ON i.insumo_id = pi.insumo_id AND i.active_flg = true
      WHERE pi.produto_id = ${produtoId} AND pi.active_flg = true
    `)

    return (fichaRes.rows as any[]).map(item => {
      const qtdNecessaria = Number(item.qtd_por_unidade) * quantidade
      const estoqueAtual   = Number(item.estoque_atual)
      return {
        insumoId:        item.insumo_id,
        nome:            item.nome,
        unidade:         item.unidade,
        qtdPorUnidade:   Number(item.qtd_por_unidade),
        qtdNecessaria,
        estoqueAtual,
        estoqueRestante: estoqueAtual - qtdNecessaria,
        insuficiente:    estoqueAtual < qtdNecessaria,
      }
    })
  }

  /**
   * Aplica o débito de fato: para cada insumo da ficha técnica do produto,
   * subtrai (qtd_por_unidade × quantidade) do estoque atual. Nunca deixa
   * o estoque ir abaixo de zero (mesmo padrão usado em Produção).
   *
   * Retorna o detalhamento do que foi debitado, pra exibir um aviso na UI
   * se algum insumo ficou insuficiente.
   */
  async debitar(produtoId: number, quantidade: number, userId: number) {
    if (quantidade <= 0) return { itens: [], teveInsuficiencia: false }

    const simulacao = await this.simular(produtoId, quantidade)
    const now = new Date()

    for (const item of simulacao) {
      const novoEstoque = Math.max(0, item.estoqueRestante)
      await this.db.execute(sql`
        UPDATE t_insumo SET estoque_atual = ${novoEstoque}, updated_dt = ${now}, updated_by = ${userId}
        WHERE insumo_id = ${item.insumoId}
      `)
    }

    return {
      itens: simulacao,
      teveInsuficiencia: simulacao.some(i => i.insuficiente),
    }
  }
}