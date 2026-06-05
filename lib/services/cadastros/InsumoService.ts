import { and, eq, ilike, count, asc, sql } from 'drizzle-orm'
import type { AppDB } from '@/lib/db/connection'
import { dbInsumo, type TpDbInsumoRow, type TpDbInsumoInsert, type TpDbInsumoUpdate } from '@/lib/db/schemas/cadastros'

export class InsumoService {
  constructor(private db: AppDB) {}

  async list({ page, limit, search }: { page: number; limit: number; search?: string }) {
    const offset = (page - 1) * limit
    const conditions = [eq(dbInsumo.activeFlag, true)]
    if (search) conditions.push(ilike(dbInsumo.nome, `%${search}%`))
    const whereClause = and(...conditions)
    const [data, totals] = await Promise.all([
      this.db.select().from(dbInsumo).where(whereClause).orderBy(asc(dbInsumo.nome)).limit(limit).offset(offset),
      this.db.select({ total: count() }).from(dbInsumo).where(whereClause),
    ])
    const total = Number(totals[0]?.total ?? 0)
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } }
  }

  async findById(id: number): Promise<TpDbInsumoRow | null> {
    const [result] = await this.db.select().from(dbInsumo).where(and(eq(dbInsumo.insumoId, id), eq(dbInsumo.activeFlag, true)))
    return result ?? null
  }

  async create(
    payload: Omit<TpDbInsumoInsert, 'insumoId' | 'modificationNum' | 'createdDt' | 'updatedDt' | 'activeFlag' | 'createdBy' | 'updatedBy'>,
    userId: number
  ) {
    const now = new Date()
    const [result] = await this.db.insert(dbInsumo).values({
      ...payload, createdBy: userId, updatedBy: userId, createdDt: now, updatedDt: now,
    }).returning({ insumoId: dbInsumo.insumoId })
    if (!result) throw new Error('Erro ao criar insumo')
    return result
  }

  async update(id: number, payload: TpDbInsumoUpdate & { modificationNum: number }, userId: number) {
    const [current] = await this.db.select({ modificationNum: dbInsumo.modificationNum }).from(dbInsumo).where(eq(dbInsumo.insumoId, id))
    if (!current) return { error: 'NOT_FOUND' }
    if (Number(current.modificationNum) !== payload.modificationNum) return { error: 'CONFLICT', modificationNum: current.modificationNum }
    const { modificationNum, ...updateFields } = payload
    const [result] = await this.db.update(dbInsumo).set({
      ...updateFields, updatedDt: new Date(), updatedBy: userId,
      modificationNum: sql`${dbInsumo.modificationNum} + 1`,
    }).where(and(eq(dbInsumo.insumoId, id), eq(dbInsumo.modificationNum, modificationNum))).returning({ insumoId: dbInsumo.insumoId })
    return result ?? { error: 'CONFLICT' }
  }

  async softDelete(id: number, userId: number) {
    const [result] = await this.db.update(dbInsumo).set({ activeFlag: false, updatedBy: userId, updatedDt: new Date() }).where(eq(dbInsumo.insumoId, id)).returning({ insumoId: dbInsumo.insumoId })
    return !!result
  }
}