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

export const dbDespesa = pgTable('t_despesa', {
  despesaId:          serial('despesa_id').primaryKey(),
  ...auditFields,
  nome:               varchar('nome', { length: 200 }).notNull(),
  categoria:          varchar('categoria', { length: 100 }).notNull(),
  valor:              integer('valor').notNull(),
  dataDespesa:        timestamp('data_despesa', { withTimezone: true }).notNull(),
  recorrente:         boolean('recorrente').notNull().default(false),
  periodoRecorrencia: varchar('periodo_recorrencia', { length: 20 }),
  observacao:         varchar('observacao', { length: 500 }),
})

export type TpDbDespesaRow    = InferSelectModel<typeof dbDespesa>
export type TpDbDespesaInsert = InferInsertModel<typeof dbDespesa>
export type TpDbDespesaUpdate = Partial<Omit<TpDbDespesaInsert, 'despesaId' | 'createdDt' | 'createdBy'>>