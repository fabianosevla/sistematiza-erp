import { pgTable, serial, integer, varchar, boolean, timestamp, date } from 'drizzle-orm/pg-core'
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm'

const audit = {
  modificationNum: integer('modification_num').notNull().default(0),
  createdDt:  timestamp('created_dt', { withTimezone: true }).notNull().defaultNow(),
  createdBy:  integer('created_by').notNull().default(1),
  updatedDt:  timestamp('updated_dt', { withTimezone: true }).notNull().defaultNow(),
  updatedBy:  integer('updated_by').notNull().default(1),
  activeFlag: boolean('active_flg').notNull().default(true),
}

// ── Contas a Pagar ────────────────────────────────────────────────────────────
export const dbContaPagar = pgTable('t_conta_pagar', {
  contaPagarId:    serial('conta_pagar_id').primaryKey(),
  ...audit,
  descricao:       varchar('descricao', { length: 300 }).notNull(),
  fornecedorId:    integer('fornecedor_id'),
  nomeFornecedor:  varchar('nome_fornecedor', { length: 200 }),
  categoria:       varchar('categoria', { length: 100 }),
  numeroDocumento: varchar('numero_documento', { length: 50 }),
  valorOriginal:   integer('valor_original').notNull(),
  valorPago:       integer('valor_pago').notNull().default(0),
  dataEmissao:     date('data_emissao').notNull(),
  dataVencimento:  date('data_vencimento').notNull(),
  dataPagamento:   date('data_pagamento'),
  status:          varchar('status', { length: 20 }).notNull().default('aberta'),
  formaPagamento:  varchar('forma_pagamento', { length: 50 }),
  observacao:      varchar('observacao', { length: 500 }),
  origem:          varchar('origem', { length: 20 }).notNull().default('manual'),
  origemId:        integer('origem_id'),
  parcelaAtual:    integer('parcela_atual').notNull().default(1),
  totalParcelas:   integer('total_parcelas').notNull().default(1),
  contaPaiId:      integer('conta_pai_id'),
  contaBancariaId: integer('conta_bancaria_id'),
})
export type TpDbContaPagarRow    = InferSelectModel<typeof dbContaPagar>
export type TpDbContaPagarInsert = InferInsertModel<typeof dbContaPagar>

// ── Contas a Receber ──────────────────────────────────────────────────────────
export const dbContaReceber = pgTable('t_conta_receber', {
  contaReceberId:   serial('conta_receber_id').primaryKey(),
  ...audit,
  descricao:        varchar('descricao', { length: 300 }).notNull(),
  clienteId:        integer('cliente_id'),
  nomeCliente:      varchar('nome_cliente', { length: 200 }),
  categoria:        varchar('categoria', { length: 100 }),
  numeroDocumento:  varchar('numero_documento', { length: 50 }),
  // valor_base é o valor cru: a soma dos itens do pedido, ou o que foi digitado
  // numa conta manual. valor_original é o que o cliente deve de fato, depois de
  // desconto e acréscimo — e continua sendo a referência de tudo que já existia
  // (KPIs, status, comparação com valor_recebido).
  //
  //   valor_original = valor_base - desconto + acrescimo
  //
  // Ver scripts/migrate-conta-receber-ajustes.js
  valorBase:        integer('valor_base'),
  desconto:         integer('desconto').notNull().default(0),
  acrescimo:        integer('acrescimo').notNull().default(0),
  valorOriginal:    integer('valor_original').notNull(),
  valorRecebido:    integer('valor_recebido').notNull().default(0),
  dataEmissao:      date('data_emissao').notNull(),
  dataVencimento:   date('data_vencimento').notNull(),
  dataRecebimento:  date('data_recebimento'),
  // Quando a mercadoria saiu. Diferente do vencimento (quando deveria pagar) e
  // do recebimento (quando pagou). Preenchida na entrega do pedido.
  // Ver scripts/migrate-conta-receber-data-entrega.js
  dataEntrega:      date('data_entrega'),
  status:           varchar('status', { length: 20 }).notNull().default('aberta'),
  formaRecebimento: varchar('forma_recebimento', { length: 50 }),
  observacao:       varchar('observacao', { length: 500 }),
  origem:           varchar('origem', { length: 20 }).notNull().default('manual'),
  origemId:         integer('origem_id'),
  parcelaAtual:     integer('parcela_atual').notNull().default(1),
  totalParcelas:    integer('total_parcelas').notNull().default(1),
  contaPaiId:       integer('conta_pai_id'),
  contaBancariaId:  integer('conta_bancaria_id'),
})
export type TpDbContaReceberRow    = InferSelectModel<typeof dbContaReceber>
export type TpDbContaReceberInsert = InferInsertModel<typeof dbContaReceber>

// ── Contas Bancárias ──────────────────────────────────────────────────────────
export const dbContaBancaria = pgTable('t_conta_bancaria', {
  contaBancariaId: serial('conta_bancaria_id').primaryKey(),
  ...audit,
  nome:          varchar('nome', { length: 100 }).notNull(),
  banco:         varchar('banco', { length: 100 }),
  agencia:       varchar('agencia', { length: 20 }),
  conta:         varchar('conta', { length: 30 }),
  tipo:          varchar('tipo', { length: 20 }).notNull().default('corrente'),
  saldoInicial:  integer('saldo_inicial').notNull().default(0),
})
export type TpDbContaBancariaRow    = InferSelectModel<typeof dbContaBancaria>
export type TpDbContaBancariaInsert = InferInsertModel<typeof dbContaBancaria>

// ── Extrato Bancário ──────────────────────────────────────────────────────────
export const dbExtratoBancario = pgTable('t_extrato_bancario', {
  extratoId:          serial('extrato_id').primaryKey(),
  ...audit,
  contaBancariaId:    integer('conta_bancaria_id').notNull(),
  dataMovimento:      date('data_movimento').notNull(),
  descricao:          varchar('descricao', { length: 300 }),
  valor:              integer('valor').notNull(),
  tipo:               varchar('tipo', { length: 10 }).notNull(),
  referencia:         varchar('referencia', { length: 100 }),
  status:             varchar('status', { length: 20 }).notNull().default('pendente'),
  conciliadoComTipo:  varchar('conciliado_com_tipo', { length: 20 }),
  conciliadoComId:    integer('conciliado_com_id'),
  importacaoLote:     varchar('importacao_lote', { length: 50 }),
})
export type TpDbExtratoBancarioRow    = InferSelectModel<typeof dbExtratoBancario>
export type TpDbExtratoBancarioInsert = InferInsertModel<typeof dbExtratoBancario>