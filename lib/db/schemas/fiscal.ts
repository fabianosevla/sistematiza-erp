import { pgTable, serial, integer, varchar, boolean, timestamp, numeric } from 'drizzle-orm/pg-core'
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm'

const auditFields = {
  modificationNum: integer('modification_num').notNull().default(0),
  createdDt:       timestamp('created_dt', { withTimezone: true }).notNull(),
  createdBy:       integer('created_by').notNull(),
  updatedDt:       timestamp('updated_dt', { withTimezone: true }).notNull(),
  updatedBy:       integer('updated_by').notNull(),
  activeFlag:      boolean('active_flg').notNull().default(true),
}

export const dbTurnoCaixa = pgTable('t_turno_caixa', {
  turnoId:         serial('turno_id').primaryKey(),
  ...auditFields,
  numeroCaixa:     integer('numero_caixa').notNull().default(1),
  operador:        varchar('operador', { length: 100 }).notNull(),
  abertoEm:        timestamp('aberto_em', { withTimezone: true }).notNull(),
  fechadoEm:       timestamp('fechado_em', { withTimezone: true }),
  status:          varchar('status', { length: 20 }).notNull().default('aberto'),
  valorAbertura:   integer('valor_abertura').notNull().default(0),
  valorFechamento: integer('valor_fechamento'),
  observacao:      varchar('observacao', { length: 500 }),
})

export const dbNotaFiscal = pgTable('t_nota_fiscal', {
  notaId:              serial('nota_id').primaryKey(),
  ...auditFields,
  tipo:                varchar('tipo', { length: 10 }).notNull(),
  numero:              varchar('numero', { length: 20 }),
  serie:               varchar('serie', { length: 5 }),
  chaveAcesso:         varchar('chave_acesso', { length: 50 }),
  status:              varchar('status', { length: 20 }).notNull().default('pendente'),
  dataEmissao:         timestamp('data_emissao', { withTimezone: true }),
  cnpjCpf:             varchar('cnpj_cpf', { length: 20 }),
  razaoSocial:         varchar('razao_social', { length: 300 }),
  uf:                  varchar('uf', { length: 2 }),
  ie:                  varchar('ie', { length: 20 }),
  cfop:                varchar('cfop', { length: 10 }),
  valorProdutos:       integer('valor_produtos').notNull().default(0),
  valorDesconto:       integer('valor_desconto').notNull().default(0),
  valorFrete:          integer('valor_frete').notNull().default(0),
  valorSeguro:         integer('valor_seguro').notNull().default(0),
  valorIpi:            integer('valor_ipi').notNull().default(0),
  valorIcms:           integer('valor_icms').notNull().default(0),
  valorTotal:          integer('valor_total').notNull().default(0),
  xmlUrl:              varchar('xml_url', { length: 500 }),
  danfeUrl:            varchar('danfe_url', { length: 500 }),
  vendaId:             integer('venda_id'),
  observacao:          varchar('observacao', { length: 1000 }),
  motivoCancelamento:  varchar('motivo_cancelamento', { length: 500 }),
})

export const dbNotaFiscalItem = pgTable('t_nota_fiscal_item', {
  itemId:         serial('item_id').primaryKey(),
  ...auditFields,
  notaId:         integer('nota_id').notNull(),
  produtoId:      integer('produto_id'),
  codigo:         varchar('codigo', { length: 60 }),
  descricao:      varchar('descricao', { length: 300 }).notNull(),
  ncm:            varchar('ncm', { length: 10 }),
  cfop:           varchar('cfop', { length: 10 }),
  unidade:        varchar('unidade', { length: 6 }),
  quantidade:     numeric('quantidade', { precision: 10, scale: 4 }).notNull().default('0'),
  precoUnitario:  integer('preco_unitario').notNull().default(0),
  valorDesconto:  integer('valor_desconto').notNull().default(0),
  valorTotal:     integer('valor_total').notNull().default(0),
  cstCsosn:       varchar('cst_csosn', { length: 10 }),
  aliqIcms:       numeric('aliq_icms', { precision: 5, scale: 2 }).notNull().default('0'),
  valorIcms:      integer('valor_icms').notNull().default(0),
  aliqIpi:        numeric('aliq_ipi', { precision: 5, scale: 2 }).notNull().default('0'),
  valorIpi:       integer('valor_ipi').notNull().default(0),
  baseSt:         integer('base_st').notNull().default(0),
  valorSt:        integer('valor_st').notNull().default(0),
})

export type TpDbTurnoCaixaRow       = InferSelectModel<typeof dbTurnoCaixa>
export type TpDbTurnoCaixaInsert    = InferInsertModel<typeof dbTurnoCaixa>
export type TpDbNotaFiscalRow       = InferSelectModel<typeof dbNotaFiscal>
export type TpDbNotaFiscalInsert    = InferInsertModel<typeof dbNotaFiscal>
export type TpDbNotaFiscalItemRow   = InferSelectModel<typeof dbNotaFiscalItem>
export type TpDbNotaFiscalItemInsert = InferInsertModel<typeof dbNotaFiscalItem>