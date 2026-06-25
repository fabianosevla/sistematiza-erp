import { and, eq, count, asc, ilike } from 'drizzle-orm'
import type { AppDB } from '@/lib/db/connection'
import { dbUsuario } from '@/lib/db/schemas/cadastros'

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

  async findByEmail(email: string) {
    const [result] = await this.db
      .select()
      .from(dbUsuario)
      .where(ilike(dbUsuario.email, email.trim()))
      .limit(1)
    return result ?? null
  }

  async create(
    payload: { clerkId: string; nome: string; email: string; perfil: string; perfilId?: number | null },
    userId: number
  ) {
    const now = new Date()
    const [result] = await this.db
      .insert(dbUsuario)
      .values({
        clerkId:   payload.clerkId,
        nome:      payload.nome,
        email:     payload.email,
        perfil:    payload.perfil,
        ...(payload.perfilId != null ? { perfilId: payload.perfilId } : {}),
        createdBy: userId,
        updatedBy: userId,
        createdDt: now,
        updatedDt: now,
      })
      .returning({ usuarioId: dbUsuario.usuarioId })
    if (!result) throw new Error('Erro ao criar usuário')
    return result
  }

  async update(id: number, payload: { nome?: string; email?: string; clerkId?: string; perfil?: string; perfilId?: number | null }) {
    const updates: any = { updatedDt: new Date() }
    if (payload.nome    != null) updates.nome    = payload.nome
    if (payload.email   != null) updates.email   = payload.email
    if (payload.clerkId != null) updates.clerkId = payload.clerkId
    if (payload.perfil  != null) updates.perfil  = payload.perfil
    if (payload.perfilId !== undefined) updates.perfilId = payload.perfilId
    const [result] = await this.db
      .update(dbUsuario)
      .set(updates)
      .where(eq(dbUsuario.usuarioId, id))
      .returning({ usuarioId: dbUsuario.usuarioId })
    return result ?? null
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