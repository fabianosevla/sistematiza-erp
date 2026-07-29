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

  /**
   * PREVISÃO DE INSUMOS DA SEMANA
   *
   * ATENÇÃO — a fonte é t_producao_grade, NÃO t_producao_semanal.
   * A tela de Produção grava a coluna PP através de POST /producao/grade, que
   * escreve em t_producao_grade. Esta função lia t_producao_semanal (tabela de
   * um desenho anterior, hoje sem escrita nenhuma), e era por isso que a
   * previsão vinha vazia mesmo com a grade preenchida e a ficha completa.
   *
   * O formato de saída segue o que a tela consome: cada item traz nomeInsumo,
   * totalNecessario, estoqueAtual e suficiente. Os campos de compra
   * (comprar / valorCompra) continuam disponíveis para quem chama a rota direto.
   */
  async getPrevisaoInsumos(dataInicio: string, dataFim: string) {
    // 1. O que está planejado na semana (coluna PP da grade)
    const planejado = await this.db.execute(sql`
      SELECT produto_id, SUM(quantidade) AS qtd
      FROM t_producao_grade
      WHERE active_flg = true
        AND data_producao >= ${dataInicio}::date
        AND data_producao <= ${dataFim}::date
      GROUP BY produto_id
      HAVING SUM(quantidade) > 0
    `)

    const quantPorProduto: Record<number, number> = {}
    for (const row of planejado.rows as any[]) {
      quantPorProduto[Number(row.produto_id)] = Number(row.qtd)
    }

    if (Object.keys(quantPorProduto).length === 0) {
      return { itens: [], totalProdutos: 0, totalItensComprar: 0, valorTotalCompra: 0 }
    }

    // 2. Para cada produto, explodir a ficha técnica.
    //    Componente com insumo_id < 0 é produto-insumo: resolve em t_produto.
    const necessidades: Record<number, any> = {}

    for (const [produtoIdStr, qtdProduzir] of Object.entries(quantPorProduto)) {
      const produtoId = Number(produtoIdStr)

      const fichaRes = await this.db.execute(sql`
        SELECT pi.insumo_id, pi.quantidade, pi.unidade,
               COALESCE(i.nome, p.nome)                   AS nome,
               COALESCE(i.estoque_atual, p.estoque_atual) AS estoque,
               COALESCE(i.preco_custo, p.preco_custo)     AS custo,
               COALESCE(i.unidade, p.unidade)             AS unidade_insumo
        FROM t_produto_insumo pi
        LEFT JOIN t_insumo  i ON pi.insumo_id = i.insumo_id     AND pi.insumo_id > 0 AND i.active_flg = true
        LEFT JOIN t_produto p ON (-pi.insumo_id) = p.produto_id AND pi.insumo_id < 0 AND p.active_flg = true
        WHERE pi.produto_id = ${produtoId} AND pi.active_flg = true
          AND (i.insumo_id IS NOT NULL OR p.produto_id IS NOT NULL)
      `)

      for (const r of fichaRes.rows as any[]) {
        const insumoId      = Number(r.insumo_id)
        const qtdNecessaria = parseFloat(String(r.quantidade)) * Number(qtdProduzir)

        if (!necessidades[insumoId]) {
          necessidades[insumoId] = {
            insumoId,
            ehProduto:       insumoId < 0,
            nomeInsumo:      r.nome ?? `Insumo #${insumoId}`,
            unidade:         r.unidade ?? r.unidade_insumo ?? 'un',
            estoqueAtual:    Number(r.estoque ?? 0),
            precoCusto:      Number(r.custo ?? 0),
            totalNecessario: 0,
          }
        }
        necessidades[insumoId].totalNecessario += qtdNecessaria
      }
    }

    // 3. Comparar com o estoque
    const itens = Object.values(necessidades).map((item: any) => {
      const comprar = Math.max(0, item.totalNecessario - item.estoqueAtual)
      return {
        ...item,
        // aliases dos nomes antigos, para não quebrar quem já consumia a rota
        nome:        item.nomeInsumo,
        necessario:  item.totalNecessario,
        emEstoque:   item.estoqueAtual,
        suficiente:  item.estoqueAtual >= item.totalNecessario,
        comprar,
        valorCompra: comprar * item.precoCusto / 100,
      }
    }).sort((a: any, b: any) => b.comprar - a.comprar)

    return {
      itens,
      totalProdutos:     Object.keys(quantPorProduto).length,
      totalItensComprar: itens.filter((i: any) => i.comprar > 0).length,
      valorTotalCompra:  itens.reduce((a: number, i: any) => a + i.valorCompra, 0),
    }
  }
}