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

// ─── Configuração do programa (1 linha por tenant) ─────────────────────────────
export const dbFidelidadeConfig = pgTable('t_fidelidade_config', {
  configId:                serial('config_id').primaryKey(),
  ...auditFields,
  programaAtivo:           boolean('programa_ativo').notNull().default(false),

  // Regras de cashback
  cashbackPctBp:           integer('cashback_pct_bp').notNull().default(500),      // basis points (500 = 5,00%)
  compraMinimaCentavos:    integer('compra_minima_centavos').notNull().default(0),
  validadeDias:            integer('validade_dias').notNull().default(0),          // 0 = não expira
  limiteUsoPctBp:          integer('limite_uso_pct_bp').notNull().default(10000),  // % da venda utilizável em cashback
  saldoMinimoUsoCentavos:  integer('saldo_minimo_uso_centavos').notNull().default(0),
  arredondamento:          varchar('arredondamento', { length: 10 }).notNull().default('centavo'), // centavo | real
  baseCalculo:             varchar('base_calculo', { length: 10 }).notNull().default('liquido'),   // bruto | liquido

  // Regras de reativação
  reativacaoAtiva:         boolean('reativacao_ativa').notNull().default(false),
  diasInatividade:         integer('dias_inatividade').notNull().default(30),
  repetirAviso:            boolean('repetir_aviso').notNull().default(false),
  intervaloRepeticaoDias:  integer('intervalo_repeticao_dias').notNull().default(30),
  maxAvisos:               integer('max_avisos').notNull().default(0),             // 0 = ilimitado
  saldoMinimoAvisoCentavos: integer('saldo_minimo_aviso_centavos').notNull().default(0),
  horarioInicio:           integer('horario_inicio').notNull().default(9),
  horarioFim:              integer('horario_fim').notNull().default(20),

  // WhatsApp (Meta Cloud API) — token cifrado
  waPhoneNumberId:         varchar('wa_phone_number_id', { length: 100 }),
  waBusinessAccountId:     varchar('wa_business_account_id', { length: 100 }),
  waTokenCipher:           varchar('wa_token_cipher', { length: 4000 }),
  waTemplateNome:          varchar('wa_template_nome', { length: 150 }),
  waTemplateIdioma:        varchar('wa_template_idioma', { length: 10 }).notNull().default('pt_BR'),

  // Texto / conformidade
  mensagemPadrao:          varchar('mensagem_padrao', { length: 1000 }),
  exigeOptin:              boolean('exige_optin').notNull().default(true),
})
export type TpDbFidelidadeConfigRow    = InferSelectModel<typeof dbFidelidadeConfig>
export type TpDbFidelidadeConfigInsert = InferInsertModel<typeof dbFidelidadeConfig>
export type TpDbFidelidadeConfigUpdate = Partial<Omit<TpDbFidelidadeConfigInsert, 'configId' | 'createdDt' | 'createdBy'>>

// ─── Extrato de cashback ───────────────────────────────────────────────────────
export const dbFidelidadeMovimento = pgTable('t_fidelidade_movimento', {
  movimentoId:   serial('movimento_id').primaryKey(),
  ...auditFields,
  clienteId:     integer('cliente_id').notNull(),
  tipo:          varchar('tipo', { length: 20 }).notNull(),   // credito | uso | estorno | ajuste | expiracao
  valorCentavos: integer('valor_centavos').notNull(),
  vendaId:       integer('venda_id'),
  expiraEm:      timestamp('expira_em', { withTimezone: true }),
  observacao:    varchar('observacao', { length: 300 }),
})
export type TpDbFidelidadeMovimentoRow    = InferSelectModel<typeof dbFidelidadeMovimento>
export type TpDbFidelidadeMovimentoInsert = InferInsertModel<typeof dbFidelidadeMovimento>

// ─── Log / trava dos avisos de reativação ──────────────────────────────────────
export const dbFidelidadeAviso = pgTable('t_fidelidade_aviso', {
  avisoId:               serial('aviso_id').primaryKey(),
  ...auditFields,
  clienteId:             integer('cliente_id').notNull(),
  enviadoEm:             timestamp('enviado_em', { withTimezone: true }),
  saldoNoEnvioCentavos:  integer('saldo_no_envio_centavos'),
  sequencia:             integer('sequencia').notNull().default(1),
  status:                varchar('status', { length: 20 }).notNull().default('enviado'), // enviado | erro | pendente
  erroMsg:               varchar('erro_msg', { length: 500 }),
  waMessageId:           varchar('wa_message_id', { length: 150 }),
})
export type TpDbFidelidadeAvisoRow    = InferSelectModel<typeof dbFidelidadeAviso>
export type TpDbFidelidadeAvisoInsert = InferInsertModel<typeof dbFidelidadeAviso>