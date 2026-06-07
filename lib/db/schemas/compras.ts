import { pgTable, serial, integer, varchar, boolean, timestamp, date, numeric } from 'drizzle-orm/pg-core'
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm'

export const dbCompraInsumo = pgTable('t_compra_insumo', {
  compraId:        serial('compra_id').primaryKey(),
  modificationNum: integer('modification_num').notNull().default(0),
  createdDt:       timestamp('created_dt', { withTimezone: true }).notNull(),
  createdBy:       integer('created_by').notNull(),
  updatedDt:       timestamp('updated_dt', { withTimezone: true }).notNull(),
  updatedBy:       integer('updated_by').notNull(),
  activeFlag:      boolean('active_flg').notNull().default(true),
  fornecedorId:    integer('fornecedor_id'),
  insumoId:        integer('insumo_id'),
  nomeFornecedor:  varchar('nome_fornecedor', { length: 200 }),
  nomeInsumo:      varchar('nome_insumo', { length: 200 }).notNull(),
  dataEntrada:     date('data_entrada').notNull(),
  dataPagamento:   date('data_pagamento'),
  valorUnitario:   integer('valor_unitario').notNull().default(0),
  quantidade:      numeric('quantidade', { precision: 10, scale: 3 }).notNull().default('0'),
  caixas:          integer('caixas').notNull().default(0),
  qtdTotal:        numeric('qtd_total', { precision: 10, scale: 3 }).notNull().default('0'),
  quemPagou:       varchar('quem_pagou', { length: 100 }),
  status:          varchar('status', { length: 20 }).notNull().default('pendente'),
  observacao:      varchar('observacao', { length: 500 }),
})

export type TpDbCompraInsumoRow    = InferSelectModel<typeof dbCompraInsumo>
export type TpDbCompraInsumoInsert = InferInsertModel<typeof dbCompraInsumo>