import { and, eq, desc } from 'drizzle-orm'
import type { AppDB } from '@/lib/db/connection'
import { dbCompraInsumo } from '@/lib/db/schemas/compras'

export class ComprasService {
  constructor(private db: AppDB) {}

  async list({ status }: { status?: string } = {}) {
    const conditions = [eq(dbCompraInsumo.activeFlag, true)]
    if (status) conditions.push(eq(dbCompraInsumo.status, status))
    return this.db.select().from(dbCompraInsumo).where(and(...conditions))
      .orderBy(desc(dbCompraInsumo.dataEntrada))
  }

  async criar(payload: {
    fornecedorId?: number; insumoId?: number; nomeFornecedor?: string; nomeInsumo: string
    dataEntrada: string; dataPagamento?: string; valorUnitario: number
    quantidade: number; caixas?: number; qtdTotal?: number; quemPagou?: string
    status?: string; observacao?: string; userId: number
  }) {
    const now = new Date()
    const [result] = await this.db.insert(dbCompraInsumo).values({
      fornecedorId:  payload.fornecedorId ?? null,
      insumoId:      payload.insumoId ?? null,
      nomeFornecedor: payload.nomeFornecedor ?? null,
      nomeInsumo:    payload.nomeInsumo,
      dataEntrada:   payload.dataEntrada,
      dataPagamento: payload.dataPagamento ?? null,
      valorUnitario: payload.valorUnitario,
      quantidade:    String(payload.quantidade),
      caixas:        payload.caixas ?? 0,
      qtdTotal:      String(payload.qtdTotal ?? payload.quantidade),
      quemPagou:     payload.quemPagou ?? null,
      status:        payload.status ?? 'pendente',
      observacao:    payload.observacao ?? null,
      createdBy:     payload.userId,
      updatedBy:     payload.userId,
      createdDt:     now,
      updatedDt:     now,
    }).returning({ compraId: dbCompraInsumo.compraId })
    return result
  }

  async pagar(id: number, { dataPagamento, quemPagou, userId }: { dataPagamento: string; quemPagou?: string; userId: number }) {
    await this.db.update(dbCompraInsumo).set({
      status: 'pago', dataPagamento, quemPagou: quemPagou ?? null,
      updatedDt: new Date(), updatedBy: userId,
    }).where(eq(dbCompraInsumo.compraId, id))
    return { ok: true }
  }

  async excluir(id: number, userId: number) {
    await this.db.update(dbCompraInsumo).set({ activeFlag: false, updatedDt: new Date(), updatedBy: userId })
      .where(eq(dbCompraInsumo.compraId, id))
    return { ok: true }
  }
}