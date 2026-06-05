import { and, eq, ilike, count, asc, sql } from 'drizzle-orm'
import type { AppDB } from '@/lib/db/connection'
import { dbCliente, type TpDbClienteRow, type TpDbClienteInsert, type TpDbClienteUpdate } from '@/lib/db/schemas/cadastros'

export class ClienteService {
  constructor(private db: AppDB) {}

  async list({ page, limit, search }: { page: number; limit: number; search?: string }) {
    const offset = (page - 1) * limit
    const conditions = [eq(dbCliente.activeFlag, true)]
    if (search) conditions.push(ilike(dbCliente.nomeCompleto, `%${search}%`))
    const whereClause = and(...conditions)
    const [data, totals] = await Promise.all([
      this.db.select().from(dbCliente).where(whereClause).orderBy(asc(dbCliente.nomeCompleto)).limit(limit).offset(offset),
      this.db.select({ total: count() }).from(dbCliente).where(whereClause),
    ])
    const total = Number(totals[0]?.total ?? 0)
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } }
  }

  async findById(id: number): Promise<TpDbClienteRow | null> {
    const [result] = await this.db.select().from(dbCliente).where(and(eq(dbCliente.clienteId, id), eq(dbCliente.activeFlag, true)))
    return result ?? null
  }

  async create(
    payload: Omit<TpDbClienteInsert, 'clienteId' | 'modificationNum' | 'createdDt' | 'updatedDt' | 'activeFlag' | 'createdBy' | 'updatedBy'>,
    userId: number
  ) {
    const now = new Date()
    const [result] = await this.db.insert(dbCliente).values({
      ...payload, createdBy: userId, updatedBy: userId, createdDt: now, updatedDt: now,
    }).returning({ clienteId: dbCliente.clienteId })
    if (!result) throw new Error('Erro ao criar cliente')
    return result
  }

  async update(id: number, payload: TpDbClienteUpdate & { modificationNum: number }, userId: number) {
    const [current] = await this.db.select({ modificationNum: dbCliente.modificationNum }).from(dbCliente).where(eq(dbCliente.clienteId, id))
    if (!current) return { error: 'NOT_FOUND' }
    if (Number(current.modificationNum) !== payload.modificationNum) return { error: 'CONFLICT', modificationNum: current.modificationNum }
    const { modificationNum, ...updateFields } = payload
    const [result] = await this.db.update(dbCliente).set({
      ...updateFields, updatedDt: new Date(), updatedBy: userId,
      modificationNum: sql`${dbCliente.modificationNum} + 1`,
    }).where(and(eq(dbCliente.clienteId, id), eq(dbCliente.modificationNum, modificationNum))).returning({ clienteId: dbCliente.clienteId })
    return result ?? { error: 'CONFLICT' }
  }

  async softDelete(id: number, userId: number) {
    const [result] = await this.db.update(dbCliente).set({ activeFlag: false, updatedBy: userId, updatedDt: new Date() }).where(eq(dbCliente.clienteId, id)).returning({ clienteId: dbCliente.clienteId })
    return !!result
  }
}