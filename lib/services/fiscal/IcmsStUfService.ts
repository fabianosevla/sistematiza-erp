// ESTE ARQUIVO VAI EM: lib/services/fiscal/IcmsStUfService.ts
//
// MVA/ICMS-ST por estado — ver comentário em lib/db/schemas/fiscal.ts
// (dbIcmsStUf) para o porquê de existir separado do perfil tributário.
import { eq, and, asc } from 'drizzle-orm'
import type { AppDB } from '@/lib/db/connection'
import { dbIcmsStUf } from '@/lib/db/schemas/fiscal'

export class IcmsStUfService {
  constructor(private db: AppDB) {}

  async list(perfilTribId?: number) {
    const condicoes = [eq(dbIcmsStUf.activeFlag, true)]
    if (perfilTribId) condicoes.push(eq(dbIcmsStUf.perfilTribId, perfilTribId))
    return this.db
      .select()
      .from(dbIcmsStUf)
      .where(and(...condicoes))
      .orderBy(asc(dbIcmsStUf.perfilTribId), asc(dbIcmsStUf.ufDestino))
  }

  /** Usado na emissão: se não houver linha pro (perfil, UF), quem chama cai no valor do perfil. */
  async buscar(perfilTribId: number, ufDestino: string) {
    const [r] = await this.db
      .select()
      .from(dbIcmsStUf)
      .where(and(
        eq(dbIcmsStUf.perfilTribId, perfilTribId),
        eq(dbIcmsStUf.ufDestino, ufDestino.toUpperCase()),
        eq(dbIcmsStUf.activeFlag, true),
      ))
    return r ?? null
  }

  async criar(payload: any, userId: number) {
    const now = new Date()
    const [r] = await this.db
      .insert(dbIcmsStUf)
      .values({ ...this.normalizar(payload), createdBy: userId, updatedBy: userId, createdDt: now, updatedDt: now })
      .returning({ icmsStUfId: dbIcmsStUf.icmsStUfId })
    return r
  }

  async atualizar(id: number, payload: any, userId: number) {
    const [r] = await this.db
      .update(dbIcmsStUf)
      .set({ ...this.normalizar(payload), updatedBy: userId, updatedDt: new Date() })
      .where(eq(dbIcmsStUf.icmsStUfId, id))
      .returning({ icmsStUfId: dbIcmsStUf.icmsStUfId })
    return r ?? null
  }

  async excluir(id: number, userId: number) {
    await this.db
      .update(dbIcmsStUf)
      .set({ activeFlag: false, updatedBy: userId, updatedDt: new Date() })
      .where(eq(dbIcmsStUf.icmsStUfId, id))
    return { ok: true }
  }

  private normalizar(p: any) {
    const dec = (v: any) => {
      const n = parseFloat(String(v ?? '0').replace(',', '.'))
      return Number.isFinite(n) ? String(n) : '0'
    }
    const txt = (v: any) => {
      const s = String(v ?? '').trim()
      return s === '' ? null : s
    }
    return {
      perfilTribId: Number(p.perfilTribId),
      ufDestino:    String(p.ufDestino ?? '').trim().toUpperCase().slice(0, 2),
      mva:          dec(p.mva),
      aliqIcmsSt:   dec(p.aliqIcmsSt),
      fonte:        txt(p.fonte),
      observacao:   txt(p.observacao),
    }
  }
}
