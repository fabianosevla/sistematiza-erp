import { pgTable, serial, integer, varchar, boolean, timestamp } from 'drizzle-orm/pg-core'
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
  // Preenchida quando a despesa nasceu do pagamento de uma conta a pagar.
  // Serve de trava contra lançar a mesma despesa duas vezes.
  // Ver scripts/migrate-despesa-de-conta-pagar.js
  contaPagarId:       integer('conta_pagar_id'),
})

export const dbGastoFixoCategoria = pgTable('t_gasto_fixo_categoria', {
  categoriaId:     serial('categoria_id').primaryKey(),
  modificationNum: integer('modification_num').notNull().default(0),
  createdDt:       timestamp('created_dt', { withTimezone: true }).notNull(),
  createdBy:       integer('created_by').notNull(),
  updatedDt:       timestamp('updated_dt', { withTimezone: true }).notNull(),
  updatedBy:       integer('updated_by').notNull(),
  activeFlag:      boolean('active_flg').notNull().default(true),
  nome:            varchar('nome', { length: 200 }).notNull(),
  ordem:           integer('ordem').notNull().default(0),
})

export const dbGastoFixoValor = pgTable('t_gasto_fixo_valor', {
  valorId:         serial('valor_id').primaryKey(),
  modificationNum: integer('modification_num').notNull().default(0),
  createdDt:       timestamp('created_dt', { withTimezone: true }).notNull(),
  createdBy:       integer('created_by').notNull(),
  updatedDt:       timestamp('updated_dt', { withTimezone: true }).notNull(),
  updatedBy:       integer('updated_by').notNull(),
  activeFlag:      boolean('active_flg').notNull().default(true),
  categoriaId:     integer('categoria_id').notNull(),
  ano:             integer('ano').notNull(),
  mes:             integer('mes').notNull(),
  valor:           integer('valor').notNull().default(0),
})

export type TpDbDespesaRow              = InferSelectModel<typeof dbDespesa>
export type TpDbDespesaInsert           = InferInsertModel<typeof dbDespesa>
export type TpDbGastoFixoCategoriaRow   = InferSelectModel<typeof dbGastoFixoCategoria>
export type TpDbGastoFixoValorRow       = InferSelectModel<typeof dbGastoFixoValor>