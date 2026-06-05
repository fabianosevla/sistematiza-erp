import {
  pgTable, serial, integer, varchar, boolean, timestamp,
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
  quantidade:       integer('quantidade').notNull(), // positivo = entrada, negativo = saida
  precoCusto:       integer('preco_custo').default(0),
  observacao:       varchar('observacao', { length: 500 }),
  dataMovimentacao: timestamp('data_movimentacao', { withTimezone: true }).notNull(),
})

export type TpDbMovimentacaoEstoqueRow    = InferSelectModel<typeof dbMovimentacaoEstoque>
export type TpDbMovimentacaoEstoqueInsert = InferInsertModel<typeof dbMovimentacaoEstoque>