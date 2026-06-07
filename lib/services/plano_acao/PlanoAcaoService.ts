import { and, eq, desc, like, or } from 'drizzle-orm'
import type { AppDB } from '@/lib/db/connection'
import { dbPlanoAcao } from '@/lib/db/schemas/planoacao'

export class PlanoAcaoService {
  constructor(private db: AppDB) {}

  async list({ status, busca }: { status?: string; busca?: string } = {}) {
    const conditions = [eq(dbPlanoAcao.activeFlag, true)]
    if (status && status !== 'todos') conditions.push(eq(dbPlanoAcao.status, status))
    if (busca) conditions.push(or(
      like(dbPlanoAcao.identificacao, `%${busca}%`),
      like(dbPlanoAcao.responsavel, `%${busca}%`),
    )!)
    return this.db.select().from(dbPlanoAcao)
      .where(and(...conditions))
      .orderBy(desc(dbPlanoAcao.dataAcao))
  }

  async criar(payload: { dataAcao: string; identificacao: string; acao: string; responsavel?: string; userId: number }) {
    const now = new Date()
    const [result] = await this.db.insert(dbPlanoAcao).values({
      dataAcao:      payload.dataAcao,
      identificacao: payload.identificacao,
      acao:          payload.acao,
      responsavel:   payload.responsavel ?? null,
      status:        'pendente',
      createdBy:     payload.userId,
      updatedBy:     payload.userId,
      createdDt:     now,
      updatedDt:     now,
    }).returning({ acaoId: dbPlanoAcao.acaoId })
    return result
  }

  async atualizar(id: number, payload: { dataAcao?: string; identificacao?: string; acao?: string; responsavel?: string; userId: number }) {
    const [result] = await this.db.update(dbPlanoAcao).set({
      ...payload,
      updatedDt: new Date(),
      updatedBy: payload.userId,
    }).where(eq(dbPlanoAcao.acaoId, id)).returning({ acaoId: dbPlanoAcao.acaoId })
    return result
  }

  async concluir(id: number, userId: number) {
    await this.db.update(dbPlanoAcao).set({
      status: 'concluido', concluidoEm: new Date(), updatedDt: new Date(), updatedBy: userId,
    }).where(eq(dbPlanoAcao.acaoId, id))
    return { ok: true }
  }

  async reabrir(id: number, userId: number) {
    await this.db.update(dbPlanoAcao).set({
      status: 'pendente', concluidoEm: null, updatedDt: new Date(), updatedBy: userId,
    }).where(eq(dbPlanoAcao.acaoId, id))
    return { ok: true }
  }

  async excluir(id: number, userId: number) {
    await this.db.update(dbPlanoAcao).set({ activeFlag: false, updatedDt: new Date(), updatedBy: userId })
      .where(eq(dbPlanoAcao.acaoId, id))
    return { ok: true }
  }
}