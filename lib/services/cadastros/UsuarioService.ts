import { and, eq, count, asc } from 'drizzle-orm'
import type { AppDB } from '@/lib/db/connection'
import { dbUsuario, type TpDbUsuarioRow } from '@/lib/db/schemas/cadastros'

export class UsuarioService {
  constructor(private db: AppDB) {}

  async list({ page, limit }: { page: number; limit: number }) {
    const offset = (page - 1) * limit
    const whereClause = eq(dbUsuario.activeFlag, true)
    const [data, totals] = await Promise.all([
      this.db.select().from(dbUsuario).where(whereClause).orderBy(asc(dbUsuario.nome)).limit(limit).offset(offset),
      this.db.select({ total: count() }).from(dbUsuario).where(whereClause),
    ])
    const total = Number(totals[0]?.total ?? 0)
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } }
  }

  async updatePerfil(id: number, perfil: string, userId: number) {
    const [result] = await this.db
      .update(dbUsuario)
      .set({ perfil, updatedBy: userId, updatedDt: new Date() })
      .where(eq(dbUsuario.usuarioId, id))
      .returning({ usuarioId: dbUsuario.usuarioId })
    return result ?? null
  }
}