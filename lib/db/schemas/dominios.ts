import { pgTable, serial, integer, varchar, boolean, timestamp } from 'drizzle-orm/pg-core'
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm'

export const dbDominio = pgTable('t_dominio', {
  dominioId:       serial('dominio_id').primaryKey(),
  modificationNum: integer('modification_num').notNull().default(0),
  createdDt:       timestamp('created_dt', { withTimezone: true }).notNull().defaultNow(),
  createdBy:       integer('created_by').notNull().default(1),
  updatedDt:       timestamp('updated_dt', { withTimezone: true }).notNull().defaultNow(),
  updatedBy:       integer('updated_by').notNull().default(1),
  activeFlag:      boolean('active_flg').notNull().default(true),
  codigo:          varchar('codigo', { length: 50 }).notNull(),
  nome:            varchar('nome', { length: 100 }).notNull(),
  descricao:       varchar('descricao', { length: 300 }),
  sistema:         boolean('sistema').notNull().default(false),
})

export const dbDominioValor = pgTable('t_dominio_valor', {
  valorId:         serial('valor_id').primaryKey(),
  modificationNum: integer('modification_num').notNull().default(0),
  createdDt:       timestamp('created_dt', { withTimezone: true }).notNull().defaultNow(),
  createdBy:       integer('created_by').notNull().default(1),
  updatedDt:       timestamp('updated_dt', { withTimezone: true }).notNull().defaultNow(),
  updatedBy:       integer('updated_by').notNull().default(1),
  activeFlag:      boolean('active_flg').notNull().default(true),
  dominioId:       integer('dominio_id').notNull(),
  valor:           varchar('valor', { length: 100 }).notNull(),
  ordem:           integer('ordem').notNull().default(0),
})

export type TpDbDominioRow         = InferSelectModel<typeof dbDominio>
export type TpDbDominioValorRow    = InferSelectModel<typeof dbDominioValor>
export type TpDbDominioInsert      = InferInsertModel<typeof dbDominio>
export type TpDbDominioValorInsert = InferInsertModel<typeof dbDominioValor>