// @ts-nocheck
import { and, eq, sql } from 'drizzle-orm'
import type { AppDB } from '@/lib/db/connection'
import { dbProdutoInsumo } from '@/lib/db/schemas/producao'

export class FichaTecnicaService {
  constructor(private db: AppDB) {}

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
        COALESCE(i.nome, p.nome)                 AS nome_insumo,
        COALESCE(i.unidade, p.unidade)           AS unidade_insumo,
        -- Custo do componente: insumo real usa o preco_custo dele; produto
        -- usado como insumo usa o custo de produção da PRÓPRIA ficha técnica
        -- (se existir) e só cai no preco_custo manual do cadastro sem ficha.
        COALESCE(
          i.preco_custo,
          (
            SELECT ROUND(SUM(pi2.quantidade * COALESCE(i3.preco_custo, p3.preco_custo, 0)))::integer
            FROM t_produto_insumo pi2
            LEFT JOIN t_insumo  i3 ON i3.insumo_id = pi2.insumo_id     AND pi2.insumo_id > 0 AND i3.active_flg = true
            LEFT JOIN t_produto p3 ON (-pi2.insumo_id) = p3.produto_id AND pi2.insumo_id < 0 AND p3.active_flg = true
            WHERE pi2.produto_id = p.produto_id AND pi2.active_flg = true
          ),
          p.preco_custo
        )                                        AS preco_custo,
        (pi.insumo_id < 0)                       AS eh_produto
      FROM t_produto_insumo pi
      LEFT JOIN t_insumo  i ON pi.insumo_id = i.insumo_id  AND pi.insumo_id > 0
      LEFT JOIN t_produto p ON (-pi.insumo_id) = p.produto_id AND pi.insumo_id < 0
      WHERE pi.produto_id = ${produtoId}
        AND pi.active_flg = true
      ORDER BY nome_insumo ASC
    `)

    return (res.rows as any[]).map(r => ({
      produtoInsumoId: r.produto_insumo_id,
      insumoId:        r.insumo_id,
      quantidade:      r.quantidade,
      unidade:         r.unidade,
      observacao:      r.observacao,
      nomeInsumo:      r.nome_insumo,
      unidadeInsumo:   r.unidade_insumo,
      precoCusto:      Number(r.preco_custo ?? 0),
      ehProduto:       r.eh_produto === true,
    }))
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

  async calcularCusto(produtoId: number): Promise<number> {
    const itens = await this.getByProduto(produtoId)
    return itens.reduce((total, item) => {
      const qtd   = parseFloat(String(item.quantidade))
      const custo = item.precoCusto ?? 0
      return total + (qtd * custo)
    }, 0)
  }
}