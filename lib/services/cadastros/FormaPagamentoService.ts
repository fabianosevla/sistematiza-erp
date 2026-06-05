import { eq } from 'drizzle-orm'
import type { AppDB } from '@/lib/db/connection'
import { dbFormaPagamento } from '@/lib/db/schemas/producao'

export class FormaPagamentoService {
  constructor(private db: AppDB) {}

  async list() {
    return this.db
      .select()
      .from(dbFormaPagamento)
      .where(eq(dbFormaPagamento.activeFlag, true))
      .orderBy(dbFormaPagamento.nome)
  }

  async criar({ nome, taxa, observacao, userId }: {
    nome:        string
    taxa:        number
    observacao?: string
    userId:      number
  }) {
    const now = new Date()
    const [result] = await this.db.insert(dbFormaPagamento).values({
      nome, taxa: String(taxa), observacao: observacao ?? null,
      createdBy: userId, updatedBy: userId, createdDt: now, updatedDt: now,
    }).returning({ formaId: dbFormaPagamento.formaId })
    return result
  }

  async atualizar(id: number, { nome, taxa, observacao, userId }: {
    nome?: string; taxa?: number; observacao?: string; userId: number
  }) {
    await this.db.update(dbFormaPagamento).set({
      ...(nome !== undefined ? { nome } : {}),
      ...(taxa !== undefined ? { taxa: String(taxa) } : {}),
      ...(observacao !== undefined ? { observacao } : {}),
      updatedDt: new Date(), updatedBy: userId,
    }).where(eq(dbFormaPagamento.formaId, id))
    return { ok: true }
  }

  async excluir(id: number, userId: number) {
    await this.db.update(dbFormaPagamento).set({
      activeFlag: false, updatedDt: new Date(), updatedBy: userId,
    }).where(eq(dbFormaPagamento.formaId, id))
    return { ok: true }
  }
}