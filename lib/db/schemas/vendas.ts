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

export const dbConfiguracoesTenant = pgTable('t_configuracoes_tenant', {
  configId:        serial('config_id').primaryKey(),
  modificationNum: integer('modification_num').notNull().default(0),
  createdDt:       timestamp('created_dt', { withTimezone: true }).notNull(),
  updatedDt:       timestamp('updated_dt', { withTimezone: true }).notNull(),
  activeFlag:      boolean('active_flg').notNull().default(true),
  comandasAtivo:   boolean('comandas_ativo').notNull().default(false),
  nomeEmpresa:     varchar('nome_empresa', { length: 200 }),
  cnpj:            varchar('cnpj', { length: 20 }),
  telefone:        varchar('telefone', { length: 20 }),
  endereco:        varchar('endereco', { length: 300 }),
  logoUrl:         varchar('logo_url', { length: 500 }),
})

export const dbComanda = pgTable('t_comanda', {
  comandaId:      serial('comanda_id').primaryKey(),
  ...auditFields,
  identificacao:  varchar('identificacao', { length: 100 }).notNull(),
  clienteId:      integer('cliente_id'),
  status:         varchar('status', { length: 20 }).notNull().default('aberta'),
  observacao:     varchar('observacao', { length: 500 }),
  desconto:       integer('desconto').notNull().default(0),
  total:          integer('total').notNull().default(0),
  vendaId:        integer('venda_id'),
  abertaEm:       timestamp('aberta_em', { withTimezone: true }).notNull(),
  fechadaEm:      timestamp('fechada_em', { withTimezone: true }),
})

export const dbComandaItem = pgTable('t_comanda_item', {
  itemId:         serial('item_id').primaryKey(),
  ...auditFields,
  comandaId:      integer('comanda_id').notNull(),
  produtoId:      integer('produto_id').notNull(),
  nomeProduto:    varchar('nome_produto', { length: 200 }).notNull(),
  quantidade:     integer('quantidade').notNull().default(1),
  precoUnitario:  integer('preco_unitario').notNull(),
  subtotal:       integer('subtotal').notNull(),
  observacao:     varchar('observacao', { length: 200 }),
})

export const dbVenda = pgTable('t_venda', {
  vendaId:           serial('venda_id').primaryKey(),
  ...auditFields,
  origem:            varchar('origem', { length: 20 }).notNull().default('direta'),
  comandaId:         integer('comanda_id'),
  clienteId:         integer('cliente_id'),
  status:            varchar('status', { length: 20 }).notNull().default('concluida'),
  tipoEntrega:       varchar('tipo_entrega', { length: 20 }).notNull().default('retirada'),
  dataEntrega:       timestamp('data_entrega', { withTimezone: true }),
  enderecoEntrega:   varchar('endereco_entrega', { length: 300 }),
  subtotal:          integer('subtotal').notNull().default(0),
  desconto:          integer('desconto').notNull().default(0),
  total:             integer('total').notNull().default(0),
  observacao:        varchar('observacao', { length: 500 }),
  observacaoInterna: varchar('observacao_interna', { length: 500 }),
  vendedor:          varchar('vendedor', { length: 100 }),
  vendidaEm:         timestamp('vendida_em', { withTimezone: true }).notNull(),
})

export const dbVendaItem = pgTable('t_venda_item', {
  itemId:         serial('item_id').primaryKey(),
  ...auditFields,
  vendaId:        integer('venda_id').notNull(),
  produtoId:      integer('produto_id').notNull(),
  nomeProduto:    varchar('nome_produto', { length: 200 }).notNull(),
  quantidade:     integer('quantidade').notNull().default(1),
  precoUnitario:  integer('preco_unitario').notNull(),
  subtotal:       integer('subtotal').notNull(),
})

export const dbVendaPagamento = pgTable('t_venda_pagamento', {
  pagamentoId:    serial('pagamento_id').primaryKey(),
  ...auditFields,
  vendaId:        integer('venda_id').notNull(),
  forma:          varchar('forma', { length: 50 }).notNull(),
  valor:          integer('valor').notNull(),
})

export type TpDbComandaRow              = InferSelectModel<typeof dbComanda>
export type TpDbComandaInsert           = InferInsertModel<typeof dbComanda>
export type TpDbComandaItemRow          = InferSelectModel<typeof dbComandaItem>
export type TpDbComandaItemInsert       = InferInsertModel<typeof dbComandaItem>
export type TpDbVendaRow                = InferSelectModel<typeof dbVenda>
export type TpDbVendaInsert             = InferInsertModel<typeof dbVenda>
export type TpDbVendaItemRow            = InferSelectModel<typeof dbVendaItem>
export type TpDbVendaItemInsert         = InferInsertModel<typeof dbVendaItem>
export type TpDbVendaPagamentoRow       = InferSelectModel<typeof dbVendaPagamento>
export type TpDbVendaPagamentoInsert    = InferInsertModel<typeof dbVendaPagamento>
export type TpDbConfiguracoesTenantRow  = InferSelectModel<typeof dbConfiguracoesTenant>