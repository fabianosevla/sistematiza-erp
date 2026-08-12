// ESTE ARQUIVO VAI EM: lib/db/schemas/producao.ts
import {
  pgTable, serial, integer, varchar, boolean, timestamp, date, numeric,
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

export const dbProdutoInsumo = pgTable('t_produto_insumo', {
  produtoInsumoId: serial('produto_insumo_id').primaryKey(),
  ...auditFields,
  produtoId:       integer('produto_id').notNull(),
  insumoId:        integer('insumo_id').notNull(),
  // 6 casas decimais: insumos usados em quantidade mínima por unidade
  // (ex.: orégano a 0,00027 kg/bandeja) precisam de precisão maior que 3
  // casas, senão viram 0,000 e distorcem custo e baixa de estoque.
  // Ver scripts/migrate-ficha-decimais.js
  quantidade:      numeric('quantidade', { precision: 12, scale: 6 }).notNull(),
  unidade:         varchar('unidade', { length: 20 }).notNull().default('kg'),
  observacao:      varchar('observacao', { length: 200 }),
})
export type TpDbProdutoInsumoRow    = InferSelectModel<typeof dbProdutoInsumo>
export type TpDbProdutoInsumoInsert = InferInsertModel<typeof dbProdutoInsumo>

export const dbClienteProduto = pgTable('t_cliente_produto', {
  clienteProdutoId:  serial('cliente_produto_id').primaryKey(),
  ...auditFields,
  clienteId:         integer('cliente_id').notNull(),
  produtoId:         integer('produto_id').notNull(),
  quantidadePadrao:  integer('quantidade_padrao').notNull().default(0),
  observacao:        varchar('observacao', { length: 200 }),
})
export type TpDbClienteProdutoRow    = InferSelectModel<typeof dbClienteProduto>
export type TpDbClienteProdutoInsert = InferInsertModel<typeof dbClienteProduto>

export const dbInsumoFornecedor = pgTable('t_insumo_fornecedor', {
  insumoFornecedorId: serial('insumo_fornecedor_id').primaryKey(),
  ...auditFields,
  insumoId:           integer('insumo_id').notNull(),
  fornecedorId:       integer('fornecedor_id').notNull(),
  precoUnitario:      integer('preco_unitario').notNull().default(0),
  unidade:            varchar('unidade', { length: 20 }),
  principal:          boolean('principal').notNull().default(false),
  observacao:         varchar('observacao', { length: 200 }),
})
export type TpDbInsumoFornecedorRow    = InferSelectModel<typeof dbInsumoFornecedor>
export type TpDbInsumoFornecedorInsert = InferInsertModel<typeof dbInsumoFornecedor>

export const dbFormaPagamento = pgTable('t_forma_pagamento', {
  formaId:         serial('forma_id').primaryKey(),
  ...auditFields,
  nome:            varchar('nome', { length: 100 }).notNull(),
  taxa:            numeric('taxa', { precision: 5, scale: 2 }).notNull().default('0'),
  observacao:      varchar('observacao', { length: 200 }),
})
export type TpDbFormaPagamentoRow    = InferSelectModel<typeof dbFormaPagamento>
export type TpDbFormaPagamentoInsert = InferInsertModel<typeof dbFormaPagamento>

export const dbPedido = pgTable('t_pedido', {
  pedidoId:          serial('pedido_id').primaryKey(),
  ...auditFields,
  clienteId:         integer('cliente_id'),
  // Cliente avulso: quem compra uma vez e não vale cadastrar. É só um nome —
  // não tem histórico nem tabela de preço, e a conta a receber gerada na
  // entrega fica sem cliente_id. Ver scripts/migrate-pedido-cliente-avulso.js
  nomeClienteAvulso: varchar('nome_cliente_avulso', { length: 200 }),
  tipoVenda:         varchar('tipo_venda', { length: 20 }).notNull().default('entrega'),
  status:            varchar('status', { length: 20 }).notNull().default('pendente'),
  dataPedido:        timestamp('data_pedido', { withTimezone: true }).notNull(),
  previsaoProducao:  timestamp('previsao_producao', { withTimezone: true }),
  previsaoEntrega:   timestamp('previsao_entrega', { withTimezone: true }),
  valorEntrega:      integer('valor_entrega').notNull().default(0),
  enderecoEntrega:   varchar('endereco_entrega', { length: 300 }),
  observacao:        varchar('observacao', { length: 500 }),
  vendaId:           integer('venda_id'),
  // Intenção fiscal, decidida no cadastro do pedido. A nota é emitida na
  // ENTREGA — mercadoria em trânsito precisa de documento, e a duplicata
  // vence depois. `notaId` trava a segunda emissão, como vendaId faz com o
  // faturamento.
  documentoFiscal:   varchar('documento_fiscal', { length: 10 }).notNull().default('nenhum'),
  imprimirNota:      boolean('imprimir_nota').notNull().default(false),
  notaId:            integer('nota_id'),
  // Forma de pagamento declarada pelo cliente no cardápio online — vem do
  // mesmo cadastro que o PDV usa (t_forma_pagamento). Pedido interno pode
  // ficar sem, por isso é nullable.
  formaPagamentoId:  integer('forma_pagamento_id'),
})
export type TpDbPedidoRow    = InferSelectModel<typeof dbPedido>
export type TpDbPedidoInsert = InferInsertModel<typeof dbPedido>

export const dbPedidoItem = pgTable('t_pedido_item', {
  itemId:        serial('item_id').primaryKey(),
  ...auditFields,
  pedidoId:      integer('pedido_id').notNull(),
  produtoId:     integer('produto_id').notNull(),
  nomeProduto:   varchar('nome_produto', { length: 200 }).notNull(),
  quantidade:    integer('quantidade').notNull().default(1),
  precoUnitario: integer('preco_unitario').notNull().default(0),
  subtotal:      integer('subtotal').notNull().default(0),
})
export type TpDbPedidoItemRow    = InferSelectModel<typeof dbPedidoItem>
export type TpDbPedidoItemInsert = InferInsertModel<typeof dbPedidoItem>

export const dbProducaoSemanal = pgTable('t_producao_semanal', {
  producaoId:      serial('producao_id').primaryKey(),
  ...auditFields,
  produtoId:       integer('produto_id').notNull(),
  dataProducao:    date('data_producao').notNull(),
  quantidade:      integer('quantidade').notNull().default(0),
  status:          varchar('status', { length: 20 }).notNull().default('planejado'),
  observacao:      varchar('observacao', { length: 200 }),
})
export type TpDbProducaoSemanalRow    = InferSelectModel<typeof dbProducaoSemanal>
export type TpDbProducaoSemanalInsert = InferInsertModel<typeof dbProducaoSemanal>