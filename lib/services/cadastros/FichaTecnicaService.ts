import { and, eq } from 'drizzle-orm'
import type { AppDB } from '@/lib/db/connection'
import { dbProdutoInsumo } from '@/lib/db/schemas/producao'
import { dbInsumo } from '@/lib/db/schemas/cadastros'

export class FichaTecnicaService {
  constructor(private db: AppDB) {}

  async getByProduto(produtoId: number) {
    const itens = await this.db
      .select({
        produtoInsumoId: dbProdutoInsumo.produtoInsumoId,
        insumoId:        dbProdutoInsumo.insumoId,
        quantidade:      dbProdutoInsumo.quantidade,
        unidade:         dbProdutoInsumo.unidade,
        observacao:      dbProdutoInsumo.observacao,
        nomeInsumo:      dbInsumo.nome,
        unidadeInsumo:   dbInsumo.unidade,
        precoCusto:      dbInsumo.precoCusto,
      })
      .from(dbProdutoInsumo)
      .leftJoin(dbInsumo, eq(dbProdutoInsumo.insumoId, dbInsumo.insumoId))
      .where(and(
        eq(dbProdutoInsumo.produtoId, produtoId),
        eq(dbProdutoInsumo.activeFlag, true),
      ))
    return itens
  }

  async addItem({ produtoId, insumoId, quantidade, unidade, observacao, userId }: {
    produtoId:   number
    insumoId:    number
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