// ESTE ARQUIVO VAI EM: lib/services/fiscal/CfopRegraService.ts
//
// REGRAS DE CFOP para operações que não são venda — ver comentário em
// lib/db/schemas/fiscal.ts (dbCfopRegra) para o porquê de existir separado
// do perfil tributário.
import { eq, asc } from 'drizzle-orm'
import type { AppDB } from '@/lib/db/connection'
import { dbCfopRegra } from '@/lib/db/schemas/fiscal'

export class CfopRegraService {
  constructor(private db: AppDB) {}

  async list() {
    return this.db
      .select()
      .from(dbCfopRegra)
      .where(eq(dbCfopRegra.activeFlag, true))
      .orderBy(asc(dbCfopRegra.tipoOperacao), asc(dbCfopRegra.localizacao))
  }

  /** Rótulos distintos já cadastrados — popula o seletor "Tipo de operação" do simulador. */
  async tiposDistintos(): Promise<string[]> {
    const regras = await this.list()
    return Array.from(new Set(regras.map(r => r.tipoOperacao)))
  }

  async criar(payload: any, userId: number) {
    const now = new Date()
    const [r] = await this.db
      .insert(dbCfopRegra)
      .values({ ...this.normalizar(payload), createdBy: userId, updatedBy: userId, createdDt: now, updatedDt: now })
      .returning({ cfopRegraId: dbCfopRegra.cfopRegraId })
    return r
  }

  async atualizar(id: number, payload: any, userId: number) {
    const [r] = await this.db
      .update(dbCfopRegra)
      .set({ ...this.normalizar(payload), updatedBy: userId, updatedDt: new Date() })
      .where(eq(dbCfopRegra.cfopRegraId, id))
      .returning({ cfopRegraId: dbCfopRegra.cfopRegraId })
    return r ?? null
  }

  async excluir(id: number, userId: number) {
    await this.db
      .update(dbCfopRegra)
      .set({ activeFlag: false, updatedBy: userId, updatedDt: new Date() })
      .where(eq(dbCfopRegra.cfopRegraId, id))
    return { ok: true }
  }

  private normalizar(p: any) {
    const txt = (v: any) => {
      const s = String(v ?? '').trim()
      return s === '' ? null : s
    }
    return {
      tipoOperacao: String(p.tipoOperacao ?? '').trim(),
      direcao:      p.direcao === 'entrada' ? 'entrada' : 'saida',
      localizacao:  p.localizacao === 'interestadual' ? 'interestadual' : 'interno',
      cfop:         String(p.cfop ?? '').trim(),
      observacao:   txt(p.observacao),
    }
  }
}
