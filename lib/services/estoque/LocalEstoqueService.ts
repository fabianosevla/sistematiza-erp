import { and, eq, sql } from 'drizzle-orm'
import type { AppDB } from '@/lib/db/connection'
import { dbLocalEstoque, dbEstoqueLocal, dbTransferenciaEstoque } from '@/lib/db/schemas/estoque-avancado'
import { dbProduto, dbInsumo } from '@/lib/db/schemas/cadastros'

/**
 * LocalEstoqueService — múltiplos locais/depósitos.
 *
 * Decisão de design: o local PADRÃO nunca tem linha própria em
 * t_estoque_local. A quantidade dele é sempre calculada como:
 *   agregado (estoque_atual do produto/insumo) − soma do que está
 *   explicitamente alocado nos OUTROS locais.
 *
 * Isso evita ter dois números que podem ficar dessincronizados — o
 * agregado em t_produto/t_insumo continua sendo a única fonte de verdade
 * pro TOTAL (e por isso PDV, Vendas, Compras, Conferência, MRP etc.
 * continuam funcionando exatamente como já funcionam, sem nenhuma mudança).
 * Transferência nunca muda o agregado, só redistribui.
 */
export class LocalEstoqueService {
  constructor(private db: AppDB) {}

  async listLocais() {
    return this.db.select().from(dbLocalEstoque).where(eq(dbLocalEstoque.activeFlag, true)).orderBy(dbLocalEstoque.nome)
  }

  async criarLocal(nome: string, descricao: string | undefined, userId: number) {
    const now = new Date()
    const [local] = await this.db.insert(dbLocalEstoque).values({
      nome, descricao, padrao: false,
      createdBy: userId, updatedBy: userId, createdDt: now, updatedDt: now,
    }).returning({ localId: dbLocalEstoque.localId })
    return local
  }

  private async getEstoqueAgregado(entidade: 'produto' | 'insumo', entidadeId: number): Promise<number> {
    if (entidade === 'produto') {
      const [p] = await this.db.select({ v: dbProduto.estoqueAtual }).from(dbProduto).where(eq(dbProduto.produtoId, entidadeId))
      return p?.v ?? 0
    }
    const [i] = await this.db.select({ v: dbInsumo.estoqueAtual }).from(dbInsumo).where(eq(dbInsumo.insumoId, entidadeId))
    return i?.v ?? 0
  }

  /** Distribuição de um item entre todos os locais (padrão calculado por resíduo) */
  async getDistribuicao(entidade: 'produto' | 'insumo', entidadeId: number) {
    const locais   = await this.listLocais()
    const agregado = await this.getEstoqueAgregado(entidade, entidadeId)

    const outros = await this.db.select().from(dbEstoqueLocal).where(and(
      eq(dbEstoqueLocal.entidade, entidade),
      eq(dbEstoqueLocal.entidadeId, entidadeId),
      eq(dbEstoqueLocal.activeFlag, true),
    ))

    const localPadrao = locais.find(l => l.padrao)
    const somaOutros = outros
      .filter(o => o.localId !== localPadrao?.localId)
      .reduce((acc, o) => acc + Number(o.quantidade), 0)

    return locais.map(local => {
      if (local.padrao) {
        return { localId: local.localId, nome: local.nome, quantidade: agregado - somaOutros, padrao: true }
      }
      const linha = outros.find(o => o.localId === local.localId)
      return { localId: local.localId, nome: local.nome, quantidade: linha ? Number(linha.quantidade) : 0, padrao: false }
    })
  }

  /** Transfere quantidade entre dois locais — NUNCA muda o agregado, só redistribui */
  async transferir({
    localOrigemId, localDestinoId, entidade, entidadeId, nomeEntidade, quantidade, observacao, userId,
  }: {
    localOrigemId: number; localDestinoId: number
    entidade: 'produto' | 'insumo'; entidadeId: number; nomeEntidade: string
    quantidade: number; observacao?: string; userId: number
  }) {
    if (quantidade <= 0) throw new Error('Quantidade deve ser maior que zero')
    if (localOrigemId === localDestinoId) throw new Error('Local de origem e destino não podem ser iguais')

    const locais = await this.listLocais()
    const localPadrao = locais.find(l => l.padrao)

    // Validação: não deixa transferir mais do que existe na origem
    const distribuicao = await this.getDistribuicao(entidade, entidadeId)
    const origemAtual = distribuicao.find(d => d.localId === localOrigemId)?.quantidade ?? 0
    if (origemAtual < quantidade) {
      throw new Error(`Estoque insuficiente no local de origem (disponível: ${origemAtual.toFixed(2)})`)
    }

    const now = new Date()

    // Debita da origem (se não for o local padrão — padrão é resíduo automático)
    if (localOrigemId !== localPadrao?.localId) {
      await this.upsertEstoqueLocal(localOrigemId, entidade, entidadeId, -quantidade, userId)
    }
    // Credita no destino (se não for o local padrão)
    if (localDestinoId !== localPadrao?.localId) {
      await this.upsertEstoqueLocal(localDestinoId, entidade, entidadeId, quantidade, userId)
    }

    await this.db.insert(dbTransferenciaEstoque).values({
      localOrigemId, localDestinoId, entidade, entidadeId, nomeEntidade, quantidade: String(quantidade),
      dataTransferencia: now.toISOString().slice(0, 10), observacao,
      createdBy: userId, updatedBy: userId, createdDt: now, updatedDt: now,
    })

    return { ok: true }
  }

  private async upsertEstoqueLocal(localId: number, entidade: string, entidadeId: number, delta: number, userId: number) {
    const now = new Date()
    const [existing] = await this.db.select().from(dbEstoqueLocal).where(and(
      eq(dbEstoqueLocal.localId, localId), eq(dbEstoqueLocal.entidade, entidade), eq(dbEstoqueLocal.entidadeId, entidadeId),
    ))
    if (existing) {
      await this.db.update(dbEstoqueLocal).set({
        quantidade: sql`${dbEstoqueLocal.quantidade} + ${delta}`, updatedDt: now, updatedBy: userId,
      }).where(eq(dbEstoqueLocal.estoqueLocalId, existing.estoqueLocalId))
    } else {
      await this.db.insert(dbEstoqueLocal).values({
        localId, entidade, entidadeId, quantidade: String(Math.max(0, delta)),
        createdBy: userId, updatedBy: userId, createdDt: now, updatedDt: now,
      })
    }
  }

  async listTransferencias(limit = 30) {
    return this.db.select().from(dbTransferenciaEstoque)
      .where(eq(dbTransferenciaEstoque.activeFlag, true))
      .orderBy(sql`${dbTransferenciaEstoque.createdDt} DESC`).limit(limit)
  }
}