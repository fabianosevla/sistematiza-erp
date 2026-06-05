import { and, eq, gte, lte } from 'drizzle-orm'
import type { AppDB } from '@/lib/db/connection'
import { dbProducaoSemanal } from '@/lib/db/schemas/producao'
import { dbProduto } from '@/lib/db/schemas/cadastros'

export class ProducaoService {
  constructor(private db: AppDB) {}

  async getGradeSemanal(dataInicio: string, dataFim: string) {
    const [producoes, produtos] = await Promise.all([
      this.db
        .select()
        .from(dbProducaoSemanal)
        .where(and(
          eq(dbProducaoSemanal.activeFlag, true),
          gte(dbProducaoSemanal.dataProducao, dataInicio),
          lte(dbProducaoSemanal.dataProducao, dataFim),
        )),
      this.db
        .select({
          produtoId:     dbProduto.produtoId,
          nome:          dbProduto.nome,
          estoqueAtual:  dbProduto.estoqueAtual,
          estoqueMinimo: dbProduto.estoqueMinimo,
          unidade:       dbProduto.unidade,
        })
        .from(dbProduto)
        .where(eq(dbProduto.activeFlag, true))
        .orderBy(dbProduto.nome),
    ])

    // Montar grade: produto × data
    const grade: Record<number, Record<string, any>> = {}
    for (const p of producoes) {
      if (!grade[p.produtoId]) grade[p.produtoId] = {}
      grade[p.produtoId][p.dataProducao] = {
        producaoId: p.producaoId,
        quantidade: p.quantidade,
        status:     p.status,
      }
    }

    return { produtos, grade }
  }

  async salvarCelula({ produtoId, dataProducao, quantidade, userId }: {
    produtoId:    number
    dataProducao: string
    quantidade:   number
    userId:       number
  }) {
    const now = new Date()

    const [existing] = await this.db
      .select()
      .from(dbProducaoSemanal)
      .where(and(
        eq(dbProducaoSemanal.produtoId, produtoId),
        eq(dbProducaoSemanal.dataProducao, dataProducao),
        eq(dbProducaoSemanal.activeFlag, true),
      ))

    if (existing) {
      await this.db.update(dbProducaoSemanal).set({
        quantidade, updatedDt: now, updatedBy: userId,
      }).where(eq(dbProducaoSemanal.producaoId, existing.producaoId))
      return { producaoId: existing.producaoId }
    }

    const [result] = await this.db.insert(dbProducaoSemanal).values({
      produtoId,
      dataProducao,
      quantidade,
      status:    'planejado',
      createdBy: userId,
      updatedBy: userId,
      createdDt: now,
      updatedDt: now,
    }).returning({ producaoId: dbProducaoSemanal.producaoId })
    return result
  }
}