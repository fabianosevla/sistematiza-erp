import {
  pgTable, serial, integer, varchar, boolean, timestamp, numeric,
} from 'drizzle-orm/pg-core'
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm'

export const dbPerfilAcesso = pgTable('t_perfil_acesso', {
  perfilId:        serial('perfil_id').primaryKey(),
  modificationNum: integer('modification_num').notNull().default(0),
  createdDt:       timestamp('created_dt', { withTimezone: true }).notNull().defaultNow(),
  createdBy:       integer('created_by').notNull().default(1),
  updatedDt:       timestamp('updated_dt', { withTimezone: true }).notNull().defaultNow(),
  updatedBy:       integer('updated_by').notNull().default(1),
  activeFlag:      boolean('active_flg').notNull().default(true),

  nome:      varchar('nome', { length: 100 }).notNull(),
  descricao: varchar('descricao', { length: 300 }),

  // Ambientes disponíveis na tela de seleção
  acessoGerencial: boolean('acesso_gerencial').notNull().default(false),
  acessoPdv:       boolean('acesso_pdv').notNull().default(false),
  acessoComanda:   boolean('acesso_comanda').notNull().default(false),
  acessoDelivery:  boolean('acesso_delivery').notNull().default(false),

  // Módulos visíveis dentro do Gerencial
  moduloDashboard:  boolean('modulo_dashboard').notNull().default(true),
  moduloCadastros:  boolean('modulo_cadastros').notNull().default(true),
  moduloVendas:     boolean('modulo_vendas').notNull().default(true),
  moduloFinanceiro: boolean('modulo_financeiro').notNull().default(false),
  moduloEstoque:    boolean('modulo_estoque').notNull().default(false),
  moduloProducao:   boolean('modulo_producao').notNull().default(false),
  moduloPedidos:    boolean('modulo_pedidos').notNull().default(false),
  moduloComandas:   boolean('modulo_comandas').notNull().default(false),
  moduloConsultas:  boolean('modulo_consultas').notNull().default(false),
  moduloFiscal:     boolean('modulo_fiscal').notNull().default(false),
  moduloPlanoAcao:  boolean('modulo_plano_acao').notNull().default(false),
  moduloMetas:      boolean('modulo_metas').notNull().default(false),
  moduloFidelidade: boolean('modulo_fidelidade').notNull().default(false),
  moduloUsuarios:   boolean('modulo_usuarios').notNull().default(false),
  // Compras — o módulo já existia em código, mas não tinha permissão própria
  moduloCompras:    boolean('modulo_compras').notNull().default(false),

  // Limites operacionais
  percDescontoMax:  numeric('perc_desconto_max', { precision: 5, scale: 2 }).notNull().default('0'),
  valorDescontoMax: integer('valor_desconto_max').notNull().default(0),

  // Admin completo
  isAdmin: boolean('is_admin').notNull().default(false),
})

export type TpDbPerfilAcessoRow    = InferSelectModel<typeof dbPerfilAcesso>
export type TpDbPerfilAcessoInsert = InferInsertModel<typeof dbPerfilAcesso>