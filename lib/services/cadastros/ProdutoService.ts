import { and, eq, ilike, count, asc, sql } from 'drizzle-orm'
import type { AppDB } from '@/lib/db/connection'
import { dbProduto, type TpDbProdutoRow, type TpDbProdutoInsert, type TpDbProdutoUpdate } from '@/lib/db/schemas/cadastros'

export class ProdutoService {
  constructor(private db: AppDB) {}

  async list({ page, limit, search }: { page: number; limit: number; search?: string }) {
    const offset = (page - 1) * limit
    const conditions = [eq(dbProduto.activeFlag, true)]
    if (search) conditions.push(ilike(dbProduto.nome, `%${search}%`))
    const whereClause = and(...conditions)
    const [data, totals] = await Promise.all([
      this.db.select().from(dbProduto).where(whereClause).orderBy(asc(dbProduto.nome)).limit(limit).offset(offset),
      this.db.select({ total: count() }).from(dbProduto).where(whereClause),
    ])
    const total = Number(totals[0]?.total ?? 0)
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } }
  }

  async findById(id: number): Promise<TpDbProdutoRow | null> {
    const [result] = await this.db.select().from(dbProduto).where(and(eq(dbProduto.produtoId, id), eq(dbProduto.activeFlag, true)))
    return result ?? null
  }

  async create(
    payload: Omit<TpDbProdutoInsert, 'produtoId' | 'modificationNum' | 'createdDt' | 'updatedDt' | 'activeFlag' | 'createdBy' | 'updatedBy'>,
    userId: number
  ) {
    const now = new Date()
    const [result] = await this.db.insert(dbProduto).values({
      ...payload, createdBy: userId, updatedBy: userId, createdDt: now, updatedDt: now,
    }).returning({ produtoId: dbProduto.produtoId })
    if (!result) throw new Error('Erro ao criar produto')
    return result
  }

  async update(id: number, payload: TpDbProdutoUpdate & { modificationNum: number }, userId: number) {
    const [current] = await this.db.select({ modificationNum: dbProduto.modificationNum }).from(dbProduto).where(eq(dbProduto.produtoId, id))
    if (!current) return { error: 'NOT_FOUND' }
    if (Number(current.modificationNum) !== payload.modificationNum) return { error: 'CONFLICT', modificationNum: current.modificationNum }
    const { modificationNum, ...updateFields } = payload
    const [result] = await this.db.update(dbProduto).set({
      ...updateFields, updatedDt: new Date(), updatedBy: userId,
      modificationNum: sql`${dbProduto.modificationNum} + 1`,
    }).where(and(eq(dbProduto.produtoId, id), eq(dbProduto.modificationNum, modificationNum))).returning({ produtoId: dbProduto.produtoId })
    return result ?? { error: 'CONFLICT' }
  }

  async softDelete(id: number, userId: number) {
    const [result] = await this.db.update(dbProduto).set({ activeFlag: false, updatedBy: userId, updatedDt: new Date() }).where(eq(dbProduto.produtoId, id)).returning({ produtoId: dbProduto.produtoId })
    return !!result
  }
}