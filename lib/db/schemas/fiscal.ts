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
  // Congelados no fechamento, e não recalculados depois: uma venda cancelada
  // amanhã mudaria o "esperado" de um turno já conferido e assinado.
  valorEsperado:   integer('valor_esperado'),
  diferenca:       integer('diferenca'),
  observacao:      varchar('observacao', { length: 500 }),
})

// SANGRIA E SUPRIMENTO.
//
// Retirar dinheiro para o cofre no meio do dia é operação normal. Sem
// registro, toda retirada legítima vira falta no fechamento — e o operador
// leva bronca por dinheiro que foi guardado corretamente.
export const dbMovimentoCaixa = pgTable('t_movimento_caixa', {
  movimentoId:  serial('movimento_id').primaryKey(),
  ...auditFields,
  turnoId:      integer('turno_id').notNull(),
  // sangria = saiu da gaveta · suprimento = entrou
  tipo:         varchar('tipo', { length: 12 }).notNull(),
  valor:        integer('valor').notNull(),
  motivo:       varchar('motivo', { length: 300 }),
  ocorridoEm:   timestamp('ocorrido_em', { withTimezone: true }).notNull(),
})

// PERFIL TRIBUTARIO — a peça que torna o fiscal parametrizável.
//
// Ninguém preenche NCM, CFOP, CSOSN e alíquota em quinhentos produtos. O
// contador cadastra alguns perfis — "Massa fresca", "Bebida com ST", "Revenda
// isenta" — e cada produto aponta para um.
//
// A divisão entre produto e perfil segue o que cada informação significa:
//   produto → descreve a MERCADORIA (NCM, CEST, origem)
//   perfil  → descreve a TRIBUTAÇÃO (CFOP, CST/CSOSN, alíquotas, ST)
//
// Os dois regimes convivem na mesma linha: Simples usa `csosn`, regime normal
// usa `cst_icms` e as alíquotas. O CRT da empresa decide qual vale. Assim o
// mesmo perfil sobrevive quando a empresa troca de regime — o que acontece.
//
// Ver scripts/migrate-fiscal-parametrizacao.js
export const dbPerfilTributario = pgTable('t_perfil_tributario', {
  perfilTribId:     serial('perfil_trib_id').primaryKey(),
  ...auditFields,
  nome:             varchar('nome', { length: 100 }).notNull(),
  descricao:        varchar('descricao', { length: 300 }),

  // CFOP muda conforme o destino da mercadoria.
  cfopInterno:       varchar('cfop_interno', { length: 4 }),
  cfopInterestadual: varchar('cfop_interestadual', { length: 4 }),

  // Simples Nacional
  csosn:            varchar('csosn', { length: 4 }),

  // Regime normal
  cstIcms:          varchar('cst_icms', { length: 3 }),
  aliqIcms:         numeric('aliq_icms', { precision: 5, scale: 2 }).notNull().default('0'),
  redBaseIcms:      numeric('red_base_icms', { precision: 5, scale: 2 }).notNull().default('0'),

  // Substituição tributária
  temSt:            boolean('tem_st').notNull().default(false),
  mva:              numeric('mva', { precision: 6, scale: 2 }).notNull().default('0'),
  aliqIcmsSt:       numeric('aliq_icms_st', { precision: 5, scale: 2 }).notNull().default('0'),

  cstPis:           varchar('cst_pis', { length: 2 }),
  aliqPis:          numeric('aliq_pis', { precision: 5, scale: 4 }).notNull().default('0'),
  cstCofins:        varchar('cst_cofins', { length: 2 }),
  aliqCofins:       numeric('aliq_cofins', { precision: 5, scale: 4 }).notNull().default('0'),

  cstIpi:           varchar('cst_ipi', { length: 2 }),
  aliqIpi:          numeric('aliq_ipi', { precision: 5, scale: 2 }).notNull().default('0'),

  infoAdicional:    varchar('info_adicional', { length: 500 }),
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
  // PIS e COFINS: o perfil tributário guardava e a nota não tinha onde
  // receber. A emissão mandava '07' — isento — para todo mundo, e alimento
  // com alíquota zero saía igual a alimento tributado.
  // Ver scripts/migrate-caixa-e-fiscal.js
  cstPis:         varchar('cst_pis', { length: 2 }),
  aliqPis:        numeric('aliq_pis', { precision: 5, scale: 4 }).notNull().default('0'),
  valorPis:       integer('valor_pis').notNull().default(0),
  cstCofins:      varchar('cst_cofins', { length: 2 }),
  aliqCofins:     numeric('aliq_cofins', { precision: 5, scale: 4 }).notNull().default('0'),
  valorCofins:    integer('valor_cofins').notNull().default(0),
  // Nacional ou importada. Vem do produto.
  origem:         varchar('origem', { length: 1 }).default('0'),
  cest:           varchar('cest', { length: 10 }),
})

export type TpDbTurnoCaixaRow       = InferSelectModel<typeof dbTurnoCaixa>
export type TpDbTurnoCaixaInsert    = InferInsertModel<typeof dbTurnoCaixa>
export type TpDbNotaFiscalRow       = InferSelectModel<typeof dbNotaFiscal>
export type TpDbNotaFiscalInsert    = InferInsertModel<typeof dbNotaFiscal>
export type TpDbNotaFiscalItemRow   = InferSelectModel<typeof dbNotaFiscalItem>
export type TpDbNotaFiscalItemInsert = InferInsertModel<typeof dbNotaFiscalItem>
export type TpDbPerfilTributarioRow    = InferSelectModel<typeof dbPerfilTributario>
export type TpDbPerfilTributarioInsert = InferInsertModel<typeof dbPerfilTributario>