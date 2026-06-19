import { and, eq, desc } from 'drizzle-orm'
import type { AppDB } from '@/lib/db/connection'
import { dbRequisicaoMaterial, dbRequisicaoItem } from '@/lib/db/schemas/compras-completo'

export class RequisicaoService {
  constructor(private db: AppDB) {}

  async list({ status }: { status?: string } = {}) {
    const conds = [eq(dbRequisicaoMaterial.activeFlag, true)]
    if (status && status !== 'todas') conds.push(eq(dbRequisicaoMaterial.status, status))
    const requisicoes = await this.db.select().from(dbRequisicaoMaterial)
      .where(and(...conds)).orderBy(desc(dbRequisicaoMaterial.dataSolicitacao))

    // Enriquecer com itens
    const result = []
    for (const r of requisicoes) {
      const itens = await this.db.select().from(dbRequisicaoItem)
        .where(and(eq(dbRequisicaoItem.requisicaoId, r.requisicaoId), eq(dbRequisicaoItem.activeFlag, true)))
      result.push({ ...r, itens })
    }
    return result
  }

  async findById(id: number) {
    const [req] = await this.db.select().from(dbRequisicaoMaterial).where(eq(dbRequisicaoMaterial.requisicaoId, id))
    if (!req) return null
    const itens = await this.db.select().from(dbRequisicaoItem)
      .where(and(eq(dbRequisicaoItem.requisicaoId, id), eq(dbRequisicaoItem.activeFlag, true)))
    return { ...req, itens }
  }

  async criar(payload: {
    dataEntrega?: string; motivo?: string; prioridade?: string
    departamento?: string; usuarioSolicitante?: string
    itens: { insumoId: number; nomeInsumo: string; quantidade: number; unidade?: string; observacao?: string }[]
    userId: number
  }) {
    const now = new Date()
    const [req] = await this.db.insert(dbRequisicaoMaterial).values({
      dataSolicitacao:    now.toISOString().slice(0, 10),
      dataEntrega:        payload.dataEntrega,
      motivo:             payload.motivo,
      prioridade:         payload.prioridade ?? 'normal',
      departamento:       payload.departamento,
      usuarioSolicitante: payload.usuarioSolicitante,
      status:             'pendente',
      createdBy: payload.userId, updatedBy: payload.userId, createdDt: now, updatedDt: now,
    }).returning({ requisicaoId: dbRequisicaoMaterial.requisicaoId })

    for (const item of payload.itens) {
      await this.db.insert(dbRequisicaoItem).values({
        requisicaoId: req.requisicaoId,
        insumoId:     item.insumoId,
        nomeInsumo:   item.nomeInsumo,
        quantidade:   String(item.quantidade),
        unidade:      item.unidade,
        observacao:   item.observacao,
        createdBy: payload.userId, updatedBy: payload.userId, createdDt: now, updatedDt: now,
      })
    }
    return req
  }

  async atualizarStatus(id: number, status: string, userId: number) {
    await this.db.update(dbRequisicaoMaterial).set({ status, updatedDt: new Date(), updatedBy: userId })
      .where(eq(dbRequisicaoMaterial.requisicaoId, id))
    return { ok: true }
  }

  async excluir(id: number, userId: number) {
    await this.db.update(dbRequisicaoMaterial).set({ activeFlag: false, updatedDt: new Date(), updatedBy: userId })
      .where(eq(dbRequisicaoMaterial.requisicaoId, id))
    return { ok: true }
  }
}