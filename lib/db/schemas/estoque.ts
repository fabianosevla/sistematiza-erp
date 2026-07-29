import {
  pgTable, serial, integer, varchar, boolean, timestamp, numeric,
} from 'drizzle-orm/pg-core'
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm'

const auditFields = {
  modificationNum: integer('modification_num').notNull().default(0),
  createdDt:       timestamp('created_dt', { withTimezone: true }).notNull(),
  createdBy:       integer('created_by').notNull(),
  updatedDt:       timestamp('updated_dt', { withTimezone: true }).notNull(),
  updatedBy:       integer('updated_by').notNull(),
  activeFlag:      boolean('active_flg').notNull().default(true),
}

export const dbMovimentacaoEstoque = pgTable('t_movimentacao_estoque', {
  movimentacaoId:   serial('movimentacao_id').primaryKey(),
  ...auditFields,
  tipo:             varchar('tipo', { length: 20 }).notNull(), // entrada | saida | ajuste
  entidade:         varchar('entidade', { length: 20 }).notNull(), // produto | insumo
  entidadeId:       integer('entidade_id').notNull(),
  // NUMERIC(12,3), não INTEGER: insumo se movimenta em fração (0,5 kg de
  // farinha, 0,25 l de azeite). Enquanto era inteira, a rota arredondava e
  // o histórico registrava 1 onde saiu 0,5.
  // Ver scripts/migrate-producao-registro.js
  // Positivo = entrada, negativo = saída. Drizzle devolve numeric como string.
  quantidade:       numeric('quantidade', { precision: 12, scale: 3 }).notNull(),
  precoCusto:       integer('preco_custo').default(0),
  observacao:       varchar('observacao', { length: 500 }),
  dataMovimentacao: timestamp('data_movimentacao', { withTimezone: true }).notNull(),
})

export type TpDbMovimentacaoEstoqueRow    = InferSelectModel<typeof dbMovimentacaoEstoque>
export type TpDbMovimentacaoEstoqueInsert = InferInsertModel<typeof dbMovimentacaoEstoque>