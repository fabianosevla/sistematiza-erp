import { and, eq, ilike, count, asc, sql } from 'drizzle-orm'
import type { AppDB } from '@/lib/db/connection'
import { dbFornecedor, type TpDbFornecedorRow, type TpDbFornecedorInsert, type TpDbFornecedorUpdate } from '@/lib/db/schemas/cadastros'

export class FornecedorService {
  constructor(private db: AppDB) {}

  async list({ page, limit, search }: { page: number; limit: number; search?: string }) {
    const offset = (page - 1) * limit
    const conditions = [eq(dbFornecedor.activeFlag, true)]
    if (search) conditions.push(ilike(dbFornecedor.nomeCompleto, `%${search}%`))
    const whereClause = and(...conditions)
    const [data, totals] = await Promise.all([
      this.db.select().from(dbFornecedor).where(whereClause).orderBy(asc(dbFornecedor.nomeCompleto)).limit(limit).offset(offset),
      this.db.select({ total: count() }).from(dbFornecedor).where(whereClause),
    ])
    const total = Number(totals[0]?.total ?? 0)
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } }
  }

  async findById(id: number): Promise<TpDbFornecedorRow | null> {
    const [result] = await this.db.select().from(dbFornecedor).where(and(eq(dbFornecedor.fornecedorId, id), eq(dbFornecedor.activeFlag, true)))
    return result ?? null
  }

  async create(
    payload: Omit<TpDbFornecedorInsert, 'fornecedorId' | 'modificationNum' | 'createdDt' | 'updatedDt' | 'activeFlag' | 'createdBy' | 'updatedBy'>,
    userId: number
  ) {
    const now = new Date()
    const [result] = await this.db.insert(dbFornecedor).values({
      ...payload, createdBy: userId, updatedBy: userId, createdDt: now, updatedDt: now,
    }).returning({ fornecedorId: dbFornecedor.fornecedorId })
    if (!result) throw new Error('Erro ao criar fornecedor')
    return result
  }

  async update(id: number, payload: TpDbFornecedorUpdate & { modificationNum: number }, userId: number) {
    const [current] = await this.db.select({ modificationNum: dbFornecedor.modificationNum }).from(dbFornecedor).where(eq(dbFornecedor.fornecedorId, id))
    if (!current) return { error: 'NOT_FOUND' }
    if (Number(current.modificationNum) !== payload.modificationNum) return { error: 'CONFLICT', modificationNum: current.modificationNum }
    const { modificationNum, ...updateFields } = payload
    const [result] = await this.db.update(dbFornecedor).set({
      ...updateFields, updatedDt: new Date(), updatedBy: userId,
      modificationNum: sql`${dbFornecedor.modificationNum} + 1`,
    }).where(and(eq(dbFornecedor.fornecedorId, id), eq(dbFornecedor.modificationNum, modificationNum))).returning({ fornecedorId: dbFornecedor.fornecedorId })
    return result ?? { error: 'CONFLICT' }
  }

  async softDelete(id: number, userId: number) {
    const [result] = await this.db.update(dbFornecedor).set({ activeFlag: false, updatedBy: userId, updatedDt: new Date() }).where(eq(dbFornecedor.fornecedorId, id)).returning({ fornecedorId: dbFornecedor.fornecedorId })
    return !!result
  }
}