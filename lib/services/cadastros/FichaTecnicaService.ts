// @ts-nocheck
import { and, eq, sql } from 'drizzle-orm'
import type { AppDB } from '@/lib/db/connection'
import { dbProdutoInsumo } from '@/lib/db/schemas/producao'
import { converterUnidade } from '@/lib/unidades'

const PROFUNDIDADE_MAX = 10

export class FichaTecnicaService {
  constructor(private db: AppDB) {}

  /**
   * Índice de TODAS as fichas ativas, carregado numa consulta só.
   * Base para o custo recursivo — evita uma ida ao banco por nível.
   */
  private async carregarIndice() {
    const res = await this.db.execute(sql`
      SELECT pi.produto_id, pi.insumo_id, pi.quantidade, pi.unidade,
             i.nome        AS insumo_nome,
             i.unidade     AS insumo_unidade,
             i.preco_custo AS insumo_custo,
             p.nome        AS produto_nome,
             p.unidade     AS produto_unidade,
             p.preco_custo AS produto_custo
      FROM t_produto_insumo pi
      LEFT JOIN t_insumo  i ON i.insumo_id = pi.insumo_id     AND pi.insumo_id > 0 AND i.active_flg = true
      LEFT JOIN t_produto p ON (-pi.insumo_id) = p.produto_id AND pi.insumo_id < 0 AND p.active_flg = true
      WHERE pi.active_flg = true
    `)

    const porProduto: Record<number, any[]> = {}
    for (const r of res.rows as any[]) {
      const pid = Number(r.produto_id)
      ;(porProduto[pid] ??= []).push(r)
    }
    return porProduto
  }

  /**
   * CUSTO DE UMA UNIDADE DE UM PRODUTO, EM CENTAVOS.
   *
   * Desce a ficha inteira, não só um nível. Era aqui o bug: a versão anterior
   * usava uma subquery SQL rasa, e um produto-insumo dentro de outro
   * produto-insumo era avaliado pelo preco_custo manual do cadastro — quase
   * sempre zero. Na prática, "Molho Bolonhesa" custava 26,27 na tela dele e
   * 20,77 dentro da Lasanha, porque o "Molho ao Sugo" que ele contém (R$ 5,50)
   * entrava valendo nada.
   *
   * Converte unidade em cada passo (kg↔g, l↔ml), igual ao ComposicaoService,
   * e protege contra referência circular. Arredonda só no fim, para o erro de
   * arredondamento não se acumular nível a nível.
   */
  private custoUnitario(
    produtoId: number,
    indice: Record<number, any[]>,
    memo: Record<number, number> = {},
    emUso: Set<number> = new Set(),
    nivel = 0,
  ): number {
    if (memo[produtoId] !== undefined) return memo[produtoId]
    if (nivel > PROFUNDIDADE_MAX || emUso.has(produtoId)) return 0

    emUso.add(produtoId)
    let total = 0

    for (const r of indice[produtoId] ?? []) {
      const qtd = parseFloat(String(r.quantidade ?? 0))
      if (!isFinite(qtd) || qtd <= 0) continue

      if (Number(r.insumo_id) > 0) {
        // Insumo puro: preço de custo do próprio insumo
        if (!r.insumo_nome) continue
        const qtdConvertida = converterUnidade(qtd, r.unidade, r.insumo_unidade)
        total += qtdConvertida * Number(r.insumo_custo ?? 0)
      } else {
        // Produto-insumo: custo da ficha DELE, recursivamente
        if (!r.produto_nome) continue
        const filhoId       = -Number(r.insumo_id)
        const custoFilho    = this.custoUnitario(filhoId, indice, memo, emUso, nivel + 1)
        const qtdConvertida = converterUnidade(qtd, r.unidade, r.produto_unidade)
        // Sem ficha própria, o filho cai no preco_custo manual do cadastro
        const unitario = custoFilho > 0 ? custoFilho : Number(r.produto_custo ?? 0)
        total += qtdConvertida * unitario
      }
    }

    emUso.delete(produtoId)
    memo[produtoId] = total
    return total
  }

  // Resolve o componente da ficha: insumo_id > 0 = insumo real (t_insumo),
  // insumo_id < 0 = produto usado como insumo (t_produto, produto_id = -insumo_id).
  async getByProduto(produtoId: number) {
    const res = await this.db.execute(sql`
      SELECT
        pi.produto_insumo_id,
        pi.insumo_id,
        pi.quantidade,
        pi.unidade,
        pi.observacao,
        COALESCE(i.nome, p.nome)       AS nome_insumo,
        COALESCE(i.unidade, p.unidade) AS unidade_insumo,
        i.preco_custo                  AS custo_insumo,
        p.preco_custo                  AS custo_produto,
        (pi.insumo_id < 0)             AS eh_produto
      FROM t_produto_insumo pi
      LEFT JOIN t_insumo  i ON pi.insumo_id = i.insumo_id     AND pi.insumo_id > 0
      LEFT JOIN t_produto p ON (-pi.insumo_id) = p.produto_id AND pi.insumo_id < 0
      WHERE pi.produto_id = ${produtoId}
        AND pi.active_flg = true
      ORDER BY nome_insumo ASC
    `)

    const linhas = res.rows as any[]

    // Só carrega o índice se houver produto-insumo na ficha — ficha sem
    // aninhamento continua custando uma consulta só.
    const temProdutoInsumo = linhas.some(r => Number(r.insumo_id) < 0)
    const indice = temProdutoInsumo ? await this.carregarIndice() : {}
    const memo: Record<number, number> = {}

    return linhas.map(r => {
      const ehProduto = Number(r.insumo_id) < 0

      let precoCusto: number
      if (!ehProduto) {
        precoCusto = Number(r.custo_insumo ?? 0)
      } else {
        const filhoId    = -Number(r.insumo_id)
        const custoFicha = this.custoUnitario(filhoId, indice, memo)
        precoCusto = custoFicha > 0 ? custoFicha : Number(r.custo_produto ?? 0)
      }

      return {
        produtoInsumoId: r.produto_insumo_id,
        insumoId:        r.insumo_id,
        quantidade:      r.quantidade,
        unidade:         r.unidade,
        observacao:      r.observacao,
        nomeInsumo:      r.nome_insumo,
        unidadeInsumo:   r.unidade_insumo,
        precoCusto:      Math.round(precoCusto),
        ehProduto,
      }
    })
  }

  async addItem({ produtoId, insumoId, quantidade, unidade, observacao, userId }: {
    produtoId:   number
    insumoId:    number   // pode ser negativo (produto-insumo)
    quantidade:  number
    unidade:     string
    observacao?: string
    userId:      number
  }) {
    const now = new Date()
    const [existing] = await this.db
      .select()
      .from(dbProdutoInsumo)
      .where(and(
        eq(dbProdutoInsumo.produtoId, produtoId),
        eq(dbProdutoInsumo.insumoId, insumoId),
        eq(dbProdutoInsumo.activeFlag, true),
      ))

    if (existing) {
      await this.db.update(dbProdutoInsumo).set({
        quantidade: String(quantidade),
        unidade,
        observacao: observacao ?? null,
        updatedDt:  now,
        updatedBy:  userId,
      }).where(eq(dbProdutoInsumo.produtoInsumoId, existing.produtoInsumoId))
      return { produtoInsumoId: existing.produtoInsumoId }
    }

    const [result] = await this.db.insert(dbProdutoInsumo).values({
      produtoId,
      insumoId,
      quantidade: String(quantidade),
      unidade,
      observacao: observacao ?? null,
      createdBy:  userId,
      updatedBy:  userId,
      createdDt:  now,
      updatedDt:  now,
    }).returning({ produtoInsumoId: dbProdutoInsumo.produtoInsumoId })
    return result
  }

  async removeItem(produtoInsumoId: number, userId: number) {
    const now = new Date()
    await this.db.update(dbProdutoInsumo).set({
      activeFlag: false, updatedDt: now, updatedBy: userId,
    }).where(eq(dbProdutoInsumo.produtoInsumoId, produtoInsumoId))
    return { ok: true }
  }

  /**
   * Custo de produção de uma unidade, em centavos.
   * Mesma recursão do custoUnitario — o número daqui e o da tela batem.
   */
  async calcularCusto(produtoId: number): Promise<number> {
    const indice = await this.carregarIndice()
    return Math.round(this.custoUnitario(produtoId, indice))
  }
}