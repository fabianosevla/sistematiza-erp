// ESTE ARQUIVO VAI EM: lib/services/dominios/DominiosService.ts
import { eq, and, asc, sql } from 'drizzle-orm'
import type { AppDB } from '@/lib/db/connection'
import { dbDominio, dbDominioValor } from '@/lib/db/schemas/dominios'

export class DominiosService {
  constructor(private db: AppDB) {}

  async listDominios() {
    const dominios = await this.db.select().from(dbDominio)
      .where(eq(dbDominio.activeFlag, true))
      .orderBy(dbDominio.nome)

    return Promise.all(dominios.map(async d => {
      const [cnt] = await this.db
        .select({ total: sql<number>`COUNT(*)` })
        .from(dbDominioValor)
        .where(and(eq(dbDominioValor.dominioId, d.dominioId), eq(dbDominioValor.activeFlag, true)))
      return { ...d, totalValores: Number(cnt?.total ?? 0) }
    }))
  }

  async getDominio(codigo: string) {
    const [dominio] = await this.db.select().from(dbDominio)
      .where(and(eq(dbDominio.codigo, codigo), eq(dbDominio.activeFlag, true)))
    if (!dominio) return null

    const valores = await this.db.select().from(dbDominioValor)
      .where(and(eq(dbDominioValor.dominioId, dominio.dominioId), eq(dbDominioValor.activeFlag, true)))
      .orderBy(asc(dbDominioValor.ordem), asc(dbDominioValor.valorId))

    return { ...dominio, valores }
  }

  async getValores(codigo: string): Promise<string[]> {
    const dominio = await this.getDominio(codigo)
    if (!dominio) return []
    return dominio.valores.map(v => v.valor)
  }

  async addValor(codigo: string, valor: string, userId: number) {
    const [dominio] = await this.db.select({ dominioId: dbDominio.dominioId })
      .from(dbDominio).where(eq(dbDominio.codigo, codigo))
    if (!dominio) throw new Error(`Domínio "${codigo}" não encontrado`)

    const rows = await this.db.execute(sql`
      SELECT COALESCE(MAX(ordem), -1) as max_ordem FROM t_dominio_valor
      WHERE dominio_id = ${dominio.dominioId} AND active_flg = true
    `)
    const novaOrdem = Number((rows.rows[0] as any)?.max_ordem ?? -1) + 1

    const now = new Date()
    const [result] = await this.db.insert(dbDominioValor).values({
      dominioId: dominio.dominioId, valor, ordem: novaOrdem,
      createdBy: userId, updatedBy: userId, createdDt: now, updatedDt: now,
    }).returning({ valorId: dbDominioValor.valorId })
    return result
  }

  // userId opcional com padrão 1: as rotas que ainda não passam o usuário
  // continuam compilando e se comportando como antes. Quando a rota passa,
  // a auditoria registra quem de fato mexeu.
  async deleteValor(valorId: number, userId = 1) {
    await this.db.update(dbDominioValor)
      .set({ activeFlag: false, updatedDt: new Date(), updatedBy: userId })
      .where(eq(dbDominioValor.valorId, valorId))
    return { ok: true }
  }

  async updateValor(valorId: number, novoValor: string, userId = 1) {
    await this.db.update(dbDominioValor)
      .set({ valor: novoValor, updatedDt: new Date(), updatedBy: userId })
      .where(eq(dbDominioValor.valorId, valorId))
    return { ok: true }
  }

  async criarDominio(codigo: string, nome: string, descricao: string | undefined, userId: number) {
    const now = new Date()
    const [result] = await this.db.insert(dbDominio).values({
      codigo, nome, descricao: descricao ?? null, sistema: false,
      createdBy: userId, updatedBy: userId, createdDt: now, updatedDt: now,
    }).returning({ dominioId: dbDominio.dominioId })
    return result
  }
}