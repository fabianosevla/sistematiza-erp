// ESTE ARQUIVO VAI EM: lib/services/fiscal/NcmReferenciaService.ts
//
// Busca de NCM por palavra-chave — ver comentário em lib/db/schemas/fiscal.ts
// (dbNcmReferencia). Não classifica produto sozinho, só ajuda a achar
// candidato: quem decide é quem cadastra o produto.
import { eq, or, ilike, asc } from 'drizzle-orm'
import type { AppDB } from '@/lib/db/connection'
import { dbNcmReferencia } from '@/lib/db/schemas/fiscal'

export class NcmReferenciaService {
  constructor(private db: AppDB) {}

  async buscar(termo?: string) {
    const base = this.db.select().from(dbNcmReferencia).where(eq(dbNcmReferencia.activeFlag, true))
    if (!termo || !termo.trim()) return base.orderBy(asc(dbNcmReferencia.ncm))
    const t = `%${termo.trim()}%`
    return this.db
      .select()
      .from(dbNcmReferencia)
      .where(or(
        ilike(dbNcmReferencia.ncm, t),
        ilike(dbNcmReferencia.descricao, t),
      ))
      .orderBy(asc(dbNcmReferencia.ncm))
  }

  async criar(payload: any, userId: number) {
    const now = new Date()
    const [r] = await this.db
      .insert(dbNcmReferencia)
      .values({ ...this.normalizar(payload), createdBy: userId, updatedBy: userId, createdDt: now, updatedDt: now })
      .returning({ ncmRefId: dbNcmReferencia.ncmRefId })
    return r
  }

  async atualizar(id: number, payload: any, userId: number) {
    const [r] = await this.db
      .update(dbNcmReferencia)
      .set({ ...this.normalizar(payload), updatedBy: userId, updatedDt: new Date() })
      .where(eq(dbNcmReferencia.ncmRefId, id))
      .returning({ ncmRefId: dbNcmReferencia.ncmRefId })
    return r ?? null
  }

  async excluir(id: number, userId: number) {
    await this.db
      .update(dbNcmReferencia)
      .set({ activeFlag: false, updatedBy: userId, updatedDt: new Date() })
      .where(eq(dbNcmReferencia.ncmRefId, id))
    return { ok: true }
  }

  private normalizar(p: any) {
    const txt = (v: any) => { const s = String(v ?? '').trim(); return s === '' ? null : s }
    return {
      ncm:          String(p.ncm ?? '').replace(/\D/g, ''),
      descricao:    String(p.descricao ?? '').trim(),
      cestSugerido: txt(p.cestSugerido),
      fonte:        txt(p.fonte),
    }
  }
}
