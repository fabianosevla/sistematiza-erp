import { pgTable, serial, integer, varchar, boolean, timestamp, date, numeric } from 'drizzle-orm/pg-core'
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm'

const audit = {
  modificationNum: integer('modification_num').notNull().default(0),
  createdDt:  timestamp('created_dt', { withTimezone: true }).notNull().defaultNow(),
  createdBy:  integer('created_by').notNull().default(1),
  updatedDt:  timestamp('updated_dt', { withTimezone: true }).notNull().defaultNow(),
  updatedBy:  integer('updated_by').notNull().default(1),
  activeFlag: boolean('active_flg').notNull().default(true),
}

// ── 1. Requisição de Material ──────────────────────────────────────────────
export const dbRequisicaoMaterial = pgTable('t_requisicao_material', {
  requisicaoId:       serial('requisicao_id').primaryKey(),
  ...audit,
  dataSolicitacao:    date('data_solicitacao').notNull(),
  dataEntrega:        date('data_entrega'),
  motivo:             varchar('motivo', { length: 300 }),
  prioridade:         varchar('prioridade', { length: 20 }).notNull().default('normal'),
  departamento:       varchar('departamento', { length: 100 }),
  usuarioSolicitante: varchar('usuario_solicitante', { length: 100 }),
  status:             varchar('status', { length: 20 }).notNull().default('pendente'),
})
export type TpDbRequisicaoMaterialRow    = InferSelectModel<typeof dbRequisicaoMaterial>
export type TpDbRequisicaoMaterialInsert = InferInsertModel<typeof dbRequisicaoMaterial>

export const dbRequisicaoItem = pgTable('t_requisicao_item', {
  itemId:        serial('item_id').primaryKey(),
  ...audit,
  requisicaoId:  integer('requisicao_id').notNull(),
  insumoId:      integer('insumo_id').notNull(),
  nomeInsumo:    varchar('nome_insumo', { length: 200 }).notNull(),
  quantidade:    numeric('quantidade', { precision: 10, scale: 3 }).notNull(),
  unidade:       varchar('unidade', { length: 20 }),
  observacao:    varchar('observacao', { length: 300 }),
})
export type TpDbRequisicaoItemRow    = InferSelectModel<typeof dbRequisicaoItem>
export type TpDbRequisicaoItemInsert = InferInsertModel<typeof dbRequisicaoItem>

// ── 2. Lista de Compras ─────────────────────────────────────────────────────
export const dbListaCompra = pgTable('t_lista_compra', {
  listaId:           serial('lista_id').primaryKey(),
  ...audit,
  descricao:         varchar('descricao', { length: 200 }),
  dataGeracao:       date('data_geracao').notNull(),
  previsaoEntrega:   date('previsao_entrega'),
  previsaoPagamento: date('previsao_pagamento'),
  origem:            varchar('origem', { length: 20 }).notNull().default('manual'),
  status:            varchar('status', { length: 20 }).notNull().default('aberta'),
})
export type TpDbListaCompraRow    = InferSelectModel<typeof dbListaCompra>
export type TpDbListaCompraInsert = InferInsertModel<typeof dbListaCompra>

export const dbListaCompraItem = pgTable('t_lista_compra_item', {
  itemId:             serial('item_id').primaryKey(),
  ...audit,
  listaId:            integer('lista_id').notNull(),
  insumoId:           integer('insumo_id').notNull(),
  nomeInsumo:         varchar('nome_insumo', { length: 200 }).notNull(),
  quantidadeSugerida: numeric('quantidade_sugerida', { precision: 10, scale: 3 }).notNull().default('0'),
  estoqueNoMomento:   numeric('estoque_no_momento', { precision: 10, scale: 3 }).notNull().default('0'),
  observacao:         varchar('observacao', { length: 300 }),
})
export type TpDbListaCompraItemRow    = InferSelectModel<typeof dbListaCompraItem>
export type TpDbListaCompraItemInsert = InferInsertModel<typeof dbListaCompraItem>

// ── 3. Cotação ────────────────────────────────────────────────────────────────
export const dbCotacao = pgTable('t_cotacao', {
  cotacaoId: serial('cotacao_id').primaryKey(),
  ...audit,
  listaId:   integer('lista_id').notNull(),
  status:    varchar('status', { length: 20 }).notNull().default('pendente'),
})
export type TpDbCotacaoRow    = InferSelectModel<typeof dbCotacao>
export type TpDbCotacaoInsert = InferInsertModel<typeof dbCotacao>

export const dbCotacaoItem = pgTable('t_cotacao_item', {
  itemId:         serial('item_id').primaryKey(),
  ...audit,
  cotacaoId:      integer('cotacao_id').notNull(),
  insumoId:       integer('insumo_id').notNull(),
  nomeInsumo:     varchar('nome_insumo', { length: 200 }).notNull(),
  fornecedorId:   integer('fornecedor_id'),
  nomeFornecedor: varchar('nome_fornecedor', { length: 200 }).notNull(),
  precoUnitario:  integer('preco_unitario').notNull().default(0),
  quantidade:     numeric('quantidade', { precision: 10, scale: 3 }).notNull().default('0'),
  selecionado:    boolean('selecionado').notNull().default(false),
})
export type TpDbCotacaoItemRow    = InferSelectModel<typeof dbCotacaoItem>
export type TpDbCotacaoItemInsert = InferInsertModel<typeof dbCotacaoItem>

// ── 4. Pedido de Compra ─────────────────────────────────────────────────────
export const dbPedidoCompra = pgTable('t_pedido_compra', {
  pedidoId:         serial('pedido_id').primaryKey(),
  ...audit,
  listaId:          integer('lista_id'),
  fornecedorId:     integer('fornecedor_id'),
  nomeFornecedor:   varchar('nome_fornecedor', { length: 200 }).notNull(),
  dataPedido:       date('data_pedido').notNull(),
  previsaoEntrega:  date('previsao_entrega'),
  status:           varchar('status', { length: 20 }).notNull().default('aberto'),
  valorTotal:       integer('valor_total').notNull().default(0),
  observacao:       varchar('observacao', { length: 500 }),
})
export type TpDbPedidoCompraRow    = InferSelectModel<typeof dbPedidoCompra>
export type TpDbPedidoCompraInsert = InferInsertModel<typeof dbPedidoCompra>

export const dbPedidoCompraItem = pgTable('t_pedido_compra_item', {
  itemId:             serial('item_id').primaryKey(),
  ...audit,
  pedidoId:           integer('pedido_id').notNull(),
  insumoId:           integer('insumo_id'),
  nomeInsumo:         varchar('nome_insumo', { length: 200 }).notNull(),
  quantidade:         numeric('quantidade', { precision: 10, scale: 3 }).notNull().default('0'),
  precoUnitario:      integer('preco_unitario').notNull().default(0),
  subtotal:           integer('subtotal').notNull().default(0),
  quantidadeRecebida: numeric('quantidade_recebida', { precision: 10, scale: 3 }).notNull().default('0'),
})
export type TpDbPedidoCompraItemRow    = InferSelectModel<typeof dbPedidoCompraItem>
export type TpDbPedidoCompraItemInsert = InferInsertModel<typeof dbPedidoCompraItem>

// ── 5. Conferência de Recebimento ───────────────────────────────────────────
export const dbConferenciaRecebimento = pgTable('t_conferencia_recebimento', {
  conferenciaId:   serial('conferencia_id').primaryKey(),
  ...audit,
  pedidoId:        integer('pedido_id').notNull(),
  dataRecebimento: date('data_recebimento').notNull(),
  status:          varchar('status', { length: 20 }).notNull().default('em_andamento'),
  observacao:      varchar('observacao', { length: 500 }),
})
export type TpDbConferenciaRecebimentoRow    = InferSelectModel<typeof dbConferenciaRecebimento>
export type TpDbConferenciaRecebimentoInsert = InferInsertModel<typeof dbConferenciaRecebimento>

export const dbConferenciaItem = pgTable('t_conferencia_item', {
  itemId:             serial('item_id').primaryKey(),
  ...audit,
  conferenciaId:      integer('conferencia_id').notNull(),
  pedidoItemId:       integer('pedido_item_id').notNull(),
  insumoId:           integer('insumo_id'),
  nomeInsumo:         varchar('nome_insumo', { length: 200 }).notNull(),
  quantidadePedida:   numeric('quantidade_pedida', { precision: 10, scale: 3 }).notNull().default('0'),
  quantidadeRecebida: numeric('quantidade_recebida', { precision: 10, scale: 3 }).notNull().default('0'),
  conforme:           boolean('conforme').notNull().default(false),
})
export type TpDbConferenciaItemRow    = InferSelectModel<typeof dbConferenciaItem>
export type TpDbConferenciaItemInsert = InferInsertModel<typeof dbConferenciaItem>