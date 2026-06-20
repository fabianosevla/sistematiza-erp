import { and, eq, gte, lte, sql, desc } from 'drizzle-orm'
import type { AppDB } from '@/lib/db/connection'
import { dbPerdaEstoque } from '@/lib/db/schemas/estoque-avancado'
import { dbProduto, dbInsumo } from '@/lib/db/schemas/cadastros'

export const MOTIVOS_PERDA = ['vencimento', 'quebra', 'contaminacao', 'erro_producao', 'outro'] as const

export class PerdaEstoqueService {
  constructor(private db: AppDB) {}

  async registrar({
    entidade, entidadeId, quantidade, motivo, dataPerda, observacao, localId, userId,
  }: {
    entidade: 'produto' | 'insumo'; entidadeId: number; quantidade: number
    motivo: typeof MOTIVOS_PERDA[number]; dataPerda?: string; observacao?: string
    localId?: number; userId: number
  }) {
    if (quantidade <= 0) throw new Error('Quantidade deve ser maior que zero')
    const now = new Date()

    let nomeEntidade = ''
    let valorEstimado = 0

    if (entidade === 'produto') {
      const [p] = await this.db.select().from(dbProduto).where(eq(dbProduto.produtoId, entidadeId))
      if (!p) throw new Error('Produto não encontrado')
      nomeEntidade = p.nome
      valorEstimado = (p.precoVarejo ?? 0) * quantidade
      if (p.estoqueAtual < quantidade) throw new Error(`Estoque insuficiente (disponível: ${p.estoqueAtual})`)
      await this.db.update(dbProduto).set({
        estoqueAtual: sql`${dbProduto.estoqueAtual} - ${quantidade}`, updatedDt: now, updatedBy: userId,
      }).where(eq(dbProduto.produtoId, entidadeId))
    } else {
      const [i] = await this.db.select().from(dbInsumo).where(eq(dbInsumo.insumoId, entidadeId))
      if (!i) throw new Error('Insumo não encontrado')
      nomeEntidade = i.nome
      valorEstimado = (i.precoCusto ?? 0) * quantidade
      if (i.estoqueAtual < quantidade) throw new Error(`Estoque insuficiente (disponível: ${i.estoqueAtual})`)
      await this.db.update(dbInsumo).set({
        estoqueAtual: sql`${dbInsumo.estoqueAtual} - ${quantidade}`, updatedDt: now, updatedBy: userId,
      }).where(eq(dbInsumo.insumoId, entidadeId))
    }

    const [perda] = await this.db.insert(dbPerdaEstoque).values({
      entidade, entidadeId, nomeEntidade, quantidade: String(quantidade), motivo,
      dataPerda: dataPerda ?? now.toISOString().slice(0, 10), observacao, localId, valorEstimado,
      createdBy: userId, updatedBy: userId, createdDt: now, updatedDt: now,
    }).returning({ perdaId: dbPerdaEstoque.perdaId })

    return perda
  }

  async list({ entidade, dataInicio, dataFim, motivo }: {
    entidade?: string; dataInicio?: string; dataFim?: string; motivo?: string
  } = {}) {
    const conds = [eq(dbPerdaEstoque.activeFlag, true)]
    if (entidade) conds.push(eq(dbPerdaEstoque.entidade, entidade))
    if (motivo)   conds.push(eq(dbPerdaEstoque.motivo, motivo))
    if (dataInicio) conds.push(gte(dbPerdaEstoque.dataPerda, dataInicio))
    if (dataFim)    conds.push(lte(dbPerdaEstoque.dataPerda, dataFim))

    const rows = await this.db.select().from(dbPerdaEstoque).where(and(...conds)).orderBy(desc(dbPerdaEstoque.dataPerda))

    const kpis = {
      totalRegistros: rows.length,
      valorTotal:     rows.reduce((a, r) => a + r.valorEstimado, 0),
      porMotivo: MOTIVOS_PERDA.reduce((acc, m) => {
        acc[m] = rows.filter(r => r.motivo === m).length
        return acc
      }, {} as Record<string, number>),
    }

    return { data: rows, kpis }
  }

  async excluir(id: number, userId: number) {
    await this.db.update(dbPerdaEstoque).set({ activeFlag: false, updatedDt: new Date(), updatedBy: userId })
      .where(eq(dbPerdaEstoque.perdaId, id))
    return { ok: true }
  }
}