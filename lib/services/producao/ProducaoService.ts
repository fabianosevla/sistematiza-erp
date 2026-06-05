import { and, eq, gte, lte, sql } from 'drizzle-orm'
import type { AppDB } from '@/lib/db/connection'
import { dbProducaoSemanal } from '@/lib/db/schemas/producao'
import { dbProduto, dbInsumo } from '@/lib/db/schemas/cadastros'
import { dbProdutoInsumo } from '@/lib/db/schemas/producao'

export class ProducaoService {
  constructor(private db: AppDB) {}

  async getGradeSemanal(dataInicio: string, dataFim: string) {
    const [producoes, produtos] = await Promise.all([
      this.db.select().from(dbProducaoSemanal).where(and(
        eq(dbProducaoSemanal.activeFlag, true),
        gte(dbProducaoSemanal.dataProducao, dataInicio),
        lte(dbProducaoSemanal.dataProducao, dataFim),
      )),
      this.db.select({
        produtoId:     dbProduto.produtoId,
        nome:          dbProduto.nome,
        estoqueAtual:  dbProduto.estoqueAtual,
        estoqueMinimo: dbProduto.estoqueMinimo,
        unidade:       dbProduto.unidade,
      }).from(dbProduto).where(eq(dbProduto.activeFlag, true)).orderBy(dbProduto.nome),
    ])

    const grade: Record<number, Record<string, any>> = {}
    for (const p of producoes) {
      if (!grade[p.produtoId]) grade[p.produtoId] = {}
      grade[p.produtoId][p.dataProducao] = {
        producaoId: p.producaoId,
        quantidade: p.quantidade,
        status:     p.status,
      }
    }

    // Total planejado por produto na semana
    const totaisPorProduto: Record<number, number> = {}
    for (const p of producoes) {
      totaisPorProduto[p.produtoId] = (totaisPorProduto[p.produtoId] ?? 0) + p.quantidade
    }

    return { produtos, grade, totaisPorProduto }
  }

  async salvarCelula({ produtoId, dataProducao, quantidade, userId }: {
    produtoId: number; dataProducao: string; quantidade: number; userId: number
  }) {
    const now = new Date()
    const [existing] = await this.db.select().from(dbProducaoSemanal).where(and(
      eq(dbProducaoSemanal.produtoId, produtoId),
      eq(dbProducaoSemanal.dataProducao, dataProducao),
      eq(dbProducaoSemanal.activeFlag, true),
    ))

    if (existing) {
      await this.db.update(dbProducaoSemanal).set({ quantidade, updatedDt: now, updatedBy: userId })
        .where(eq(dbProducaoSemanal.producaoId, existing.producaoId))
      return { producaoId: existing.producaoId }
    }

    const [result] = await this.db.insert(dbProducaoSemanal).values({
      produtoId, dataProducao, quantidade, status: 'planejado',
      createdBy: userId, updatedBy: userId, createdDt: now, updatedDt: now,
    }).returning({ producaoId: dbProducaoSemanal.producaoId })
    return result
  }

  async getPrevisaoInsumos(dataInicio: string, dataFim: string) {
    // 1. Buscar o que está planejado na semana
    const producoes = await this.db.select().from(dbProducaoSemanal).where(and(
      eq(dbProducaoSemanal.activeFlag, true),
      gte(dbProducaoSemanal.dataProducao, dataInicio),
      lte(dbProducaoSemanal.dataProducao, dataFim),
    ))

    if (producoes.length === 0) return { itens: [], totalProdutos: 0 }

    // 2. Agrupar por produto
    const quantPorProduto: Record<number, number> = {}
    for (const p of producoes) {
      quantPorProduto[p.produtoId] = (quantPorProduto[p.produtoId] ?? 0) + p.quantidade
    }

    // 3. Para cada produto, buscar a ficha técnica
    const necessidades: Record<number, { insumoId: number; nomeinsumo: string; unidade: string; necessario: number; emEstoque: number; comprar: number; precoCusto: number }> = {}

    for (const [produtoIdStr, qtdProduzir] of Object.entries(quantPorProduto)) {
      const produtoId = Number(produtoIdStr)

      const fichaItens = await this.db.select({
        insumoId:   dbProdutoInsumo.insumoId,
        quantidade: dbProdutoInsumo.quantidade,
        unidade:    dbProdutoInsumo.unidade,
        nome:       dbInsumo.nome,
        estoque:    dbInsumo.estoqueAtual,
        custo:      dbInsumo.precoCusto,
        unidadeInsumo: dbInsumo.unidade,
      }).from(dbProdutoInsumo)
        .leftJoin(dbInsumo, eq(dbProdutoInsumo.insumoId, dbInsumo.insumoId))
        .where(and(eq(dbProdutoInsumo.produtoId, produtoId), eq(dbProdutoInsumo.activeFlag, true)))

      for (const fi of fichaItens) {
        const qtdNecessaria = parseFloat(String(fi.quantidade)) * qtdProduzir
        if (!necessidades[fi.insumoId]) {
          necessidades[fi.insumoId] = {
            insumoId:   fi.insumoId,
            nomeinsumo: fi.nome ?? `Insumo #${fi.insumoId}`,
            unidade:    fi.unidade ?? fi.unidadeInsumo ?? 'un',
            necessario: 0,
            emEstoque:  fi.estoque ?? 0,
            comprar:    0,
            precoCusto: fi.custo ?? 0,
          }
        }
        necessidades[fi.insumoId].necessario += qtdNecessaria
      }
    }

    // 4. Calcular o que precisa comprar
    const itens = Object.values(necessidades).map(item => ({
      ...item,
      comprar: Math.max(0, item.necessario - item.emEstoque),
      valorCompra: Math.max(0, item.necessario - item.emEstoque) * item.precoCusto / 100,
    })).sort((a, b) => b.comprar - a.comprar)

    return {
      itens,
      totalProdutos:    Object.keys(quantPorProduto).length,
      totalItensComprar: itens.filter(i => i.comprar > 0).length,
      valorTotalCompra: itens.reduce((a, i) => a + i.valorCompra, 0),
    }
  }
}