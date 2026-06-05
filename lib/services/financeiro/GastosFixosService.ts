import { and, eq, asc } from 'drizzle-orm'
import type { AppDB } from '@/lib/db/connection'
import { dbGastoFixoCategoria, dbGastoFixoValor } from '@/lib/db/schemas/financeiro'

export class GastosFixosService {
  constructor(private db: AppDB) {}

  async getCategorias() {
    return this.db.select().from(dbGastoFixoCategoria)
      .where(eq(dbGastoFixoCategoria.activeFlag, true))
      .orderBy(asc(dbGastoFixoCategoria.ordem))
  }

  async criarCategoria(nome: string, userId: number) {
    const now = new Date()
    const todas = await this.getCategorias()
    const [result] = await this.db.insert(dbGastoFixoCategoria).values({
      nome, ordem: todas.length + 1,
      createdBy: userId, updatedBy: userId, createdDt: now, updatedDt: now,
    }).returning({ categoriaId: dbGastoFixoCategoria.categoriaId })
    return result
  }

  async getGrade(ano: number) {
    const [categorias, valores] = await Promise.all([
      this.getCategorias(),
      this.db.select().from(dbGastoFixoValor).where(
        and(eq(dbGastoFixoValor.ano, ano), eq(dbGastoFixoValor.activeFlag, true))
      ),
    ])

    const grade: Record<number, Record<number, number>> = {}
    for (const v of valores) {
      if (!grade[v.categoriaId]) grade[v.categoriaId] = {}
      grade[v.categoriaId][v.mes] = v.valor
    }

    return { categorias, grade, ano }
  }

  async salvarValor({ categoriaId, ano, mes, valor, userId }: {
    categoriaId: number; ano: number; mes: number; valor: number; userId: number
  }) {
    const now = new Date()
    const [existing] = await this.db.select().from(dbGastoFixoValor)
      .where(and(
        eq(dbGastoFixoValor.categoriaId, categoriaId),
        eq(dbGastoFixoValor.ano, ano),
        eq(dbGastoFixoValor.mes, mes),
      ))

    if (existing) {
      await this.db.update(dbGastoFixoValor).set({ valor, updatedDt: now, updatedBy: userId })
        .where(eq(dbGastoFixoValor.valorId, existing.valorId))
      return { valorId: existing.valorId }
    }

    const [result] = await this.db.insert(dbGastoFixoValor).values({
      categoriaId, ano, mes, valor,
      createdBy: userId, updatedBy: userId, createdDt: now, updatedDt: now,
    }).returning({ valorId: dbGastoFixoValor.valorId })
    return result
  }

  async getTotalMes(ano: number, mes: number): Promise<number> {
    const valores = await this.db.select().from(dbGastoFixoValor)
      .where(and(eq(dbGastoFixoValor.ano, ano), eq(dbGastoFixoValor.mes, mes), eq(dbGastoFixoValor.activeFlag, true)))
    return valores.reduce((a, v) => a + v.valor, 0)
  }
}