import { pgTable, serial, integer, boolean, timestamp } from 'drizzle-orm/pg-core'
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm'

export const dbMeta = pgTable('t_meta', {
  metaId:           serial('meta_id').primaryKey(),
  modificationNum:  integer('modification_num').notNull().default(0),
  createdDt:        timestamp('created_dt', { withTimezone: true }).notNull().defaultNow(),
  createdBy:        integer('created_by').notNull().default(1),
  updatedDt:        timestamp('updated_dt', { withTimezone: true }).notNull().defaultNow(),
  updatedBy:        integer('updated_by').notNull().default(1),
  activeFlag:       boolean('active_flg').notNull().default(true),
  mes:              integer('mes').notNull(),
  ano:              integer('ano').notNull(),
  metaReceita:      integer('meta_receita').notNull().default(0),
  metaDespesaMaxima:integer('meta_despesa_maxima').notNull().default(0),
  metaLucro:        integer('meta_lucro').notNull().default(0),
})

export type TpDbMetaRow    = InferSelectModel<typeof dbMeta>
export type TpDbMetaInsert = InferInsertModel<typeof dbMeta>