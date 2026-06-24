import { and, eq, desc, sql } from 'drizzle-orm'
import type { AppDB } from '@/lib/db/connection'
import { pool } from '@/lib/db/connection'
import { dbCompraInsumo } from '@/lib/db/schemas/compras'
import { dbInsumo } from '@/lib/db/schemas/cadastros'
import { dbDespesa } from '@/lib/db/schemas/financeiro'

export class ComprasService {
  constructor(private db: AppDB, private schemaName: string = '') {}

  async list({ status }: { status?: string } = {}) {
    const conditions = [eq(dbCompraInsumo.activeFlag, true)]
    if (status) conditions.push(eq(dbCompraInsumo.status, status))
    return this.db.select().from(dbCompraInsumo).where(and(...conditions))
      .orderBy(desc(dbCompraInsumo.dataEntrada))
  }

  async criar(payload: {
    fornecedorId?:  number
    insumoId?:      number
    nomeFornecedor?: string
    nomeInsumo:     string
    dataEntrada:    string
    dataPagamento?: string
    valorUnitario:  number
    quantidade:     number
    caixas?:        number
    qtdTotal?:      number
    quemPagou?:     string
    status?:        string
    observacao?:    string
    userId:         number
  }) {
    const now      = new Date()
    const qtdTotal = payload.qtdTotal ?? payload.quantidade
    const valorTotal = Math.round(payload.valorUnitario * qtdTotal)

    // 1. Registra a compra
    const [result] = await this.db.insert(dbCompraInsumo).values({
      fornecedorId:   payload.fornecedorId ?? null,
      insumoId:       payload.insumoId ?? null,
      nomeFornecedor: payload.nomeFornecedor ?? null,
      nomeInsumo:     payload.nomeInsumo,
      dataEntrada:    payload.dataEntrada,
      dataPagamento:  payload.dataPagamento ?? null,
      valorUnitario:  payload.valorUnitario,
      quantidade:     String(payload.quantidade),
      caixas:         payload.caixas ?? 0,
      qtdTotal:       String(qtdTotal),
      quemPagou:      payload.quemPagou ?? null,
      status:         payload.status ?? 'confirmado',
      observacao:     payload.observacao ?? null,
      createdBy:      payload.userId,
      updatedBy:      payload.userId,
      createdDt:      now,
      updatedDt:      now,
    }).returning({ compraId: dbCompraInsumo.compraId })

    // 2. Aumenta estoque do insumo (se insumoId informado)
    if (payload.insumoId) {
      await this.db.update(dbInsumo).set({
        estoqueAtual: sql`${dbInsumo.estoqueAtual} + ${qtdTotal}`,
        precoCusto:   payload.valorUnitario,
        updatedDt:    now,
        updatedBy:    payload.userId,
      }).where(eq(dbInsumo.insumoId, payload.insumoId))
    }

    // 3. Lança despesa automática no financeiro via pool (search_path correto)
    if (this.schemaName && valorTotal > 0) {
      try {
        const client = await pool.connect()
        try {
          await client.query(`SET search_path TO "${this.schemaName}", public`)
          const dt = new Date(payload.dataEntrada + 'T12:00:00')
          const mes = dt.getMonth() + 1
          const ano = dt.getFullYear()
          await client.query(`
            INSERT INTO t_despesa (
              nome, categoria, valor, data_despesa, recorrente,
              mes_competencia, ano_competencia,
              gerada_automaticamente,
              created_by, updated_by, created_dt, updated_dt, active_flg, modification_num
            ) VALUES ($1, $2, $3, $4, false, $5, $6, true, $7, $7, NOW(), NOW(), true, 0)
          `, [
            `Compra: ${payload.nomeInsumo}${payload.nomeFornecedor ? ' — ' + payload.nomeFornecedor : ''}`,
            'Compras e Insumos',
            valorTotal,
            dt.toISOString(),
            mes,
            ano,
            payload.userId,
          ])
        } finally {
          client.release()
        }
      } catch (_) {
        // Não bloqueia a compra se o lançamento de despesa falhar
      }
    }

    return { ...result, valorTotal }
  }

  async pagar(id: number, { dataPagamento, quemPagou, userId }: {
    dataPagamento: string; quemPagou?: string; userId: number
  }) {
    await this.db.update(dbCompraInsumo).set({
      status:        'pago',
      dataPagamento,
      quemPagou:     quemPagou ?? null,
      updatedDt:     new Date(),
      updatedBy:     userId,
    }).where(eq(dbCompraInsumo.compraId, id))
    return { ok: true }
  }

  async excluir(id: number, userId: number) {
    await this.db.update(dbCompraInsumo).set({
      activeFlag: false,
      updatedDt:  new Date(),
      updatedBy:  userId,
    }).where(eq(dbCompraInsumo.compraId, id))
    return { ok: true }
  }
}