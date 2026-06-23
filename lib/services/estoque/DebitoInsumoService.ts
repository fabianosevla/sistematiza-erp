import type { AppDB } from '@/lib/db/connection'
import { pool } from '@/lib/db/connection'

function converterUnidade(quantidade: number, unidadeFicha: string, unidadeEstoque: string): number {
  const f = unidadeFicha.toLowerCase().trim()
  const e = unidadeEstoque.toLowerCase().trim()
  if (f === e) return quantidade
  if (f === 'g'  && e === 'kg') return quantidade / 1000
  if (f === 'kg' && e === 'g')  return quantidade * 1000
  if (f === 'mg' && e === 'g')  return quantidade / 1000
  if (f === 'mg' && e === 'kg') return quantidade / 1_000_000
  if (f === 'ml' && e === 'l')  return quantidade / 1000
  if (f === 'l'  && e === 'ml') return quantidade * 1000
  if (f === 'cl' && e === 'l')  return quantidade / 100
  if (f === 'l'  && e === 'cl') return quantidade * 100
  console.warn(`[DebitoInsumoService] conversão não suportada: ${f} → ${e}`)
  return quantidade
}

export class DebitoInsumoService {
  constructor(private db: AppDB, private schemaName: string) {}

  async simular(produtoId: number, quantidade: number) {
    const client = await pool.connect()
    try {
      await client.query(`SET search_path TO "${this.schemaName}", public`)
      const fichaRes = await client.query(
        `SELECT pi.insumo_id, pi.quantidade AS qtd_por_unidade_ficha, pi.unidade AS unidade_ficha,
                i.nome, i.unidade AS unidade_estoque, i.estoque_atual
         FROM t_produto_insumo pi
         JOIN t_insumo i ON i.insumo_id = pi.insumo_id AND i.active_flg = true
         WHERE pi.produto_id = $1 AND pi.active_flg = true`,
        [produtoId]
      )
      return fichaRes.rows.map((item: any) => {
        const qtdFichaPorUnidade      = Number(item.qtd_por_unidade_ficha)
        const unidadeFicha            = String(item.unidade_ficha)
        const unidadeEstoque          = String(item.unidade_estoque)
        const estoqueAtual            = Number(item.estoque_atual)
        const qtdPorUnidadeConvertida = converterUnidade(qtdFichaPorUnidade, unidadeFicha, unidadeEstoque)
        const qtdTotalDebitar         = qtdPorUnidadeConvertida * quantidade
        const estoqueRestante         = estoqueAtual - qtdTotalDebitar
        return {
          insumoId: item.insumo_id, nome: item.nome,
          unidadeFicha, unidadeEstoque,
          qtdFichaPorUnidade, qtdPorUnidadeConvertida, qtdTotalDebitar,
          estoqueAtual, estoqueRestante,
          insuficiente: estoqueAtual < qtdTotalDebitar,
        }
      })
    } finally {
      client.release()
    }
  }

  async debitar(produtoId: number, quantidade: number, userId: number) {
    if (quantidade <= 0) return { itens: [], teveInsuficiencia: false }
    const simulacao = await this.simular(produtoId, quantidade)
    const client = await pool.connect()
    try {
      await client.query(`SET search_path TO "${this.schemaName}", public`)
      const now = new Date()
      for (const item of simulacao) {
        const novoEstoque = Math.max(0, parseFloat(item.estoqueRestante.toFixed(4)))
        await client.query(
          `UPDATE t_insumo SET estoque_atual = $1, updated_dt = $2, updated_by = $3 WHERE insumo_id = $4`,
          [novoEstoque, now, userId, item.insumoId]
        )
      }
    } finally {
      client.release()
    }
    return { itens: simulacao, teveInsuficiencia: simulacao.some(i => i.insuficiente) }
  }
}