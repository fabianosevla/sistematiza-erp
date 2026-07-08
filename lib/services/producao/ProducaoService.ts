// @ts-nocheck
import { and, eq, gte, lte, sql } from 'drizzle-orm'
import type { AppDB } from '@/lib/db/connection'
import { dbProducaoSemanal, dbProdutoInsumo } from '@/lib/db/schemas/producao'
import { dbProduto } from '@/lib/db/schemas/cadastros'

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

    // 3. Para cada produto, buscar a ficha técnica (insumo real OU produto-insumo)
    const necessidades: Record<number, { insumoId: number; nomeinsumo: string; unidade: string; necessario: number; emEstoque: number; comprar: number; precoCusto: number }> = {}

    for (const [produtoIdStr, qtdProduzir] of Object.entries(quantPorProduto)) {
      const produtoId = Number(produtoIdStr)

      // Componente com insumo_id < 0 = produto-insumo: resolve em t_produto.
      const fichaRes = await this.db.execute(sql`
        SELECT pi.insumo_id, pi.quantidade, pi.unidade,
               COALESCE(i.nome, p.nome)                 AS nome,
               COALESCE(i.estoque_atual, p.estoque_atual) AS estoque,
               COALESCE(i.preco_custo, p.preco_custo)   AS custo,
               COALESCE(i.unidade, p.unidade)           AS unidade_insumo
        FROM t_produto_insumo pi
        LEFT JOIN t_insumo  i ON pi.insumo_id = i.insumo_id     AND pi.insumo_id > 0 AND i.active_flg = true
        LEFT JOIN t_produto p ON (-pi.insumo_id) = p.produto_id AND pi.insumo_id < 0 AND p.active_flg = true
        WHERE pi.produto_id = ${produtoId} AND pi.active_flg = true
          AND (i.insumo_id IS NOT NULL OR p.produto_id IS NOT NULL)
      `)

      const fichaItens = (fichaRes.rows as any[]).map(r => ({
        insumoId:      r.insumo_id,
        quantidade:    r.quantidade,
        unidade:       r.unidade,
        nome:          r.nome,
        estoque:       Number(r.estoque ?? 0),
        custo:         Number(r.custo ?? 0),
        unidadeInsumo: r.unidade_insumo,
      }))

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