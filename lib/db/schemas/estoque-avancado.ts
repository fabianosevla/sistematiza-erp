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

// ── 1. Locais / Depósitos ───────────────────────────────────────────────────
export const dbLocalEstoque = pgTable('t_local_estoque', {
  localId:   serial('local_id').primaryKey(),
  ...audit,
  nome:      varchar('nome', { length: 150 }).notNull(),
  descricao: varchar('descricao', { length: 300 }),
  padrao:    boolean('padrao').notNull().default(false),
})
export type TpDbLocalEstoqueRow    = InferSelectModel<typeof dbLocalEstoque>
export type TpDbLocalEstoqueInsert = InferInsertModel<typeof dbLocalEstoque>

export const dbEstoqueLocal = pgTable('t_estoque_local', {
  estoqueLocalId: serial('estoque_local_id').primaryKey(),
  ...audit,
  localId:        integer('local_id').notNull(),
  entidade:       varchar('entidade', { length: 10 }).notNull(), // 'produto' | 'insumo'
  entidadeId:     integer('entidade_id').notNull(),
  quantidade:     numeric('quantidade', { precision: 10, scale: 3 }).notNull().default('0'),
})
export type TpDbEstoqueLocalRow    = InferSelectModel<typeof dbEstoqueLocal>
export type TpDbEstoqueLocalInsert = InferInsertModel<typeof dbEstoqueLocal>

export const dbTransferenciaEstoque = pgTable('t_transferencia_estoque', {
  transferenciaId:    serial('transferencia_id').primaryKey(),
  ...audit,
  localOrigemId:      integer('local_origem_id').notNull(),
  localDestinoId:     integer('local_destino_id').notNull(),
  entidade:           varchar('entidade', { length: 10 }).notNull(),
  entidadeId:         integer('entidade_id').notNull(),
  nomeEntidade:       varchar('nome_entidade', { length: 200 }).notNull(),
  quantidade:         numeric('quantidade', { precision: 10, scale: 3 }).notNull(),
  dataTransferencia:  date('data_transferencia').notNull(),
  observacao:         varchar('observacao', { length: 300 }),
})
export type TpDbTransferenciaEstoqueRow    = InferSelectModel<typeof dbTransferenciaEstoque>
export type TpDbTransferenciaEstoqueInsert = InferInsertModel<typeof dbTransferenciaEstoque>

// ── 2. Perda de Produto/Insumo ──────────────────────────────────────────────
export const dbPerdaEstoque = pgTable('t_perda_estoque', {
  perdaId:       serial('perda_id').primaryKey(),
  ...audit,
  entidade:      varchar('entidade', { length: 10 }).notNull(),
  entidadeId:    integer('entidade_id').notNull(),
  nomeEntidade:  varchar('nome_entidade', { length: 200 }).notNull(),
  quantidade:    numeric('quantidade', { precision: 10, scale: 3 }).notNull(),
  motivo:        varchar('motivo', { length: 30 }).notNull(), // vencimento|quebra|contaminacao|erro_producao|outro
  dataPerda:     date('data_perda').notNull(),
  observacao:    varchar('observacao', { length: 300 }),
  localId:       integer('local_id'),
  valorEstimado: integer('valor_estimado').notNull().default(0),
})
export type TpDbPerdaEstoqueRow    = InferSelectModel<typeof dbPerdaEstoque>
export type TpDbPerdaEstoqueInsert = InferInsertModel<typeof dbPerdaEstoque>

// ── 3. Contagem de Inventário ───────────────────────────────────────────────
export const dbContagemInventario = pgTable('t_contagem_inventario', {
  contagemId:   serial('contagem_id').primaryKey(),
  ...audit,
  descricao:    varchar('descricao', { length: 200 }),
  dataContagem: date('data_contagem').notNull(),
  status:       varchar('status', { length: 20 }).notNull().default('aberta'), // aberta|concluida
  localId:      integer('local_id'),
})
export type TpDbContagemInventarioRow    = InferSelectModel<typeof dbContagemInventario>
export type TpDbContagemInventarioInsert = InferInsertModel<typeof dbContagemInventario>

export const dbContagemInventarioItem = pgTable('t_contagem_inventario_item', {
  itemId:             serial('item_id').primaryKey(),
  ...audit,
  contagemId:         integer('contagem_id').notNull(),
  entidade:           varchar('entidade', { length: 10 }).notNull(),
  entidadeId:         integer('entidade_id').notNull(),
  nomeEntidade:       varchar('nome_entidade', { length: 200 }).notNull(),
  quantidadeSistema:  numeric('quantidade_sistema', { precision: 10, scale: 3 }).notNull().default('0'),
  quantidadeContada:  numeric('quantidade_contada', { precision: 10, scale: 3 }),
  diferenca:          numeric('diferenca', { precision: 10, scale: 3 }),
})
export type TpDbContagemInventarioItemRow    = InferSelectModel<typeof dbContagemInventarioItem>
export type TpDbContagemInventarioItemInsert = InferInsertModel<typeof dbContagemInventarioItem>

// ── 4. Entrada via XML de NF-e ──────────────────────────────────────────────
export const dbEntradaNfe = pgTable('t_entrada_nfe', {
  entradaId:       serial('entrada_id').primaryKey(),
  ...audit,
  chaveAcesso:     varchar('chave_acesso', { length: 44 }),
  numeroNfe:       varchar('numero_nfe', { length: 20 }),
  nomeFornecedor:  varchar('nome_fornecedor', { length: 200 }),
  cnpjFornecedor:  varchar('cnpj_fornecedor', { length: 20 }),
  dataEmissao:     date('data_emissao'),
  valorTotal:      integer('valor_total').notNull().default(0),
  status:          varchar('status', { length: 20 }).notNull().default('pendente'), // pendente|processada
  pedidoId:        integer('pedido_id'),
})
export type TpDbEntradaNfeRow    = InferSelectModel<typeof dbEntradaNfe>
export type TpDbEntradaNfeInsert = InferInsertModel<typeof dbEntradaNfe>

export const dbEntradaNfeItem = pgTable('t_entrada_nfe_item', {
  itemId:        serial('item_id').primaryKey(),
  ...audit,
  entradaId:     integer('entrada_id').notNull(),
  codigoXml:     varchar('codigo_xml', { length: 60 }),
  descricaoXml:  varchar('descricao_xml', { length: 300 }).notNull(),
  ncm:           varchar('ncm', { length: 10 }),
  quantidade:    numeric('quantidade', { precision: 10, scale: 3 }).notNull(),
  valorUnitario: integer('valor_unitario').notNull(),
  valorTotal:    integer('valor_total').notNull(),
  insumoId:      integer('insumo_id'), // mapeado pelo usuário — null até confirmar
  // Imposto do XML do FORNECEDOR — diz como ELE tributou a venda pra
  // Zaghi. valorIcmsSt > 0 = o fornecedor já reteve substituição
  // tributária desse item; sem isso, não dá pra saber qual CSOSN usar
  // na hora de revender (era exatamente a dúvida do vinho).
  cfop:          varchar('cfop', { length: 4 }),
  cstCsosn:      varchar('cst_csosn', { length: 10 }),
  valorIcms:     integer('valor_icms').notNull().default(0),
  valorBcSt:     integer('valor_bc_st').notNull().default(0),
  valorIcmsSt:   integer('valor_icms_st').notNull().default(0),
})
export type TpDbEntradaNfeItemRow    = InferSelectModel<typeof dbEntradaNfeItem>
export type TpDbEntradaNfeItemInsert = InferInsertModel<typeof dbEntradaNfeItem>