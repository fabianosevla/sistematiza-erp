import { and, eq } from 'drizzle-orm'
import type { AppDB } from '@/lib/db/connection'
import { dbContagemInventario, dbContagemInventarioItem } from '@/lib/db/schemas/estoque-avancado'
import { dbProduto, dbInsumo } from '@/lib/db/schemas/cadastros'
import { EstoqueService } from '@/lib/services/estoque/EstoqueService'

export class ContagemInventarioService {
  constructor(private db: AppDB) {}

  /**
   * Inicia uma contagem já populada com TODOS os produtos e insumos ativos,
   * com o snapshot do estoque do sistema no momento — mais prático que
   * selecionar item por item.
   */
  async iniciar({ descricao, localId, userId }: { descricao?: string; localId?: number; userId: number }) {
    const now = new Date()
    const [contagem] = await this.db.insert(dbContagemInventario).values({
      descricao: descricao ?? `Contagem ${now.toLocaleDateString('pt-BR')}`,
      dataContagem: now.toISOString().slice(0, 10),
      status: 'aberta', localId,
      createdBy: userId, updatedBy: userId, createdDt: now, updatedDt: now,
    }).returning({ contagemId: dbContagemInventario.contagemId })

    const produtos = await this.db.select().from(dbProduto).where(eq(dbProduto.activeFlag, true))
    const insumos  = await this.db.select().from(dbInsumo).where(eq(dbInsumo.activeFlag, true))

    for (const p of produtos) {
      await this.db.insert(dbContagemInventarioItem).values({
        contagemId: contagem.contagemId, entidade: 'produto', entidadeId: p.produtoId,
        nomeEntidade: p.nome, quantidadeSistema: String(p.estoqueAtual),
        createdBy: userId, updatedBy: userId, createdDt: now, updatedDt: now,
      })
    }
    for (const i of insumos) {
      await this.db.insert(dbContagemInventarioItem).values({
        contagemId: contagem.contagemId, entidade: 'insumo', entidadeId: i.insumoId,
        nomeEntidade: i.nome, quantidadeSistema: String(i.estoqueAtual),
        createdBy: userId, updatedBy: userId, createdDt: now, updatedDt: now,
      })
    }

    return contagem
  }

  async list({ status }: { status?: string } = {}) {
    const conds = [eq(dbContagemInventario.activeFlag, true)]
    if (status && status !== 'todas') conds.push(eq(dbContagemInventario.status, status))
    return this.db.select().from(dbContagemInventario).where(and(...conds)).orderBy(dbContagemInventario.dataContagem)
  }

  async findById(id: number) {
    const [contagem] = await this.db.select().from(dbContagemInventario).where(eq(dbContagemInventario.contagemId, id))
    if (!contagem) return null
    const itens = await this.db.select().from(dbContagemInventarioItem)
      .where(and(eq(dbContagemInventarioItem.contagemId, id), eq(dbContagemInventarioItem.activeFlag, true)))
    return { ...contagem, itens }
  }

  /** Lança a quantidade contada de um item e calcula a diferença */
  async lancarItem(itemId: number, quantidadeContada: number, userId: number) {
    const [item] = await this.db.select().from(dbContagemInventarioItem).where(eq(dbContagemInventarioItem.itemId, itemId))
    if (!item) throw new Error('Item não encontrado')
    const diferenca = quantidadeContada - Number(item.quantidadeSistema)
    await this.db.update(dbContagemInventarioItem).set({
      quantidadeContada: String(quantidadeContada), diferenca: String(diferenca),
      updatedDt: new Date(), updatedBy: userId,
    }).where(eq(dbContagemInventarioItem.itemId, itemId))
    return { ok: true, diferenca }
  }

  /**
   * Finaliza a contagem: pra cada item com diferença ≠ 0, aplica um AJUSTE
   * de estoque (reaproveita EstoqueService.movimentar, que já sabe lidar
   * com ajuste sem disparar débito de insumo — ajuste é correção, não
   * fabricação).
   */
  async finalizar(contagemId: number, userId: number) {
    const contagem = await this.findById(contagemId)
    if (!contagem) throw new Error('Contagem não encontrada')

    const estoqueService = new EstoqueService(this.db)
    let ajustesAplicados = 0

    for (const item of contagem.itens) {
      if (item.quantidadeContada === null) continue
      const diferenca = Number(item.diferenca ?? 0)
      if (diferenca === 0) continue

      await estoqueService.movimentar({
        entidade: item.entidade as 'produto' | 'insumo',
        entidadeId: item.entidadeId,
        tipo: 'ajuste',
        quantidade: Number(item.quantidadeContada),
        observacao: `Ajuste por Contagem de Inventário #${contagemId}`,
        userId,
      })
      ajustesAplicados++
    }

    await this.db.update(dbContagemInventario).set({ status: 'concluida', updatedDt: new Date(), updatedBy: userId })
      .where(eq(dbContagemInventario.contagemId, contagemId))

    return { ok: true, ajustesAplicados }
  }
}