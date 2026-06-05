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

// ─── Clientes ─────────────────────────────────────────────────────────────────
export const dbCliente = pgTable('t_cliente', {
  clienteId:    serial('cliente_id').primaryKey(),
  ...auditFields,
  tipoPessoa:   varchar('tipo_pessoa', { length: 2 }).notNull().default('PF'),
  nomeCompleto: varchar('nome_completo', { length: 200 }).notNull(),
  nomeFantasia: varchar('nome_fantasia', { length: 200 }),
  documento:    varchar('documento', { length: 20 }),
  email:        varchar('email', { length: 150 }),
  telefone:     varchar('telefone', { length: 20 }),
  celular:      varchar('celular', { length: 20 }),
  cep:          varchar('cep', { length: 10 }),
  endereco:     varchar('endereco', { length: 200 }),
  numero:       varchar('numero', { length: 10 }),
  complemento:  varchar('complemento', { length: 100 }),
  bairro:       varchar('bairro', { length: 100 }),
  cidade:       varchar('cidade', { length: 100 }),
  uf:           varchar('uf', { length: 2 }),
  observacao:   varchar('observacao', { length: 500 }),
})
export type TpDbClienteRow    = InferSelectModel<typeof dbCliente>
export type TpDbClienteInsert = InferInsertModel<typeof dbCliente>
export type TpDbClienteUpdate = Partial<Omit<TpDbClienteInsert, 'clienteId' | 'createdDt' | 'createdBy'>>

// ─── Fornecedores ─────────────────────────────────────────────────────────────
export const dbFornecedor = pgTable('t_fornecedor', {
  fornecedorId: serial('fornecedor_id').primaryKey(),
  ...auditFields,
  tipoPessoa:   varchar('tipo_pessoa', { length: 2 }).notNull().default('PJ'),
  nomeCompleto: varchar('nome_completo', { length: 200 }).notNull(),
  nomeFantasia: varchar('nome_fantasia', { length: 200 }),
  cnpjCpf:      varchar('cnpj_cpf', { length: 20 }),
  email:        varchar('email', { length: 150 }),
  telefone:     varchar('telefone', { length: 20 }),
  celular:      varchar('celular', { length: 20 }),
  contato:      varchar('contato', { length: 100 }),
  cep:          varchar('cep', { length: 10 }),
  endereco:     varchar('endereco', { length: 200 }),
  numero:       varchar('numero', { length: 10 }),
  complemento:  varchar('complemento', { length: 100 }),
  bairro:       varchar('bairro', { length: 100 }),
  cidade:       varchar('cidade', { length: 100 }),
  uf:           varchar('uf', { length: 2 }),
  observacao:   varchar('observacao', { length: 500 }),
})
export type TpDbFornecedorRow    = InferSelectModel<typeof dbFornecedor>
export type TpDbFornecedorInsert = InferInsertModel<typeof dbFornecedor>
export type TpDbFornecedorUpdate = Partial<Omit<TpDbFornecedorInsert, 'fornecedorId' | 'createdDt' | 'createdBy'>>

// ─── Produtos ─────────────────────────────────────────────────────────────────
export const dbProduto = pgTable('t_produto', {
  produtoId:     serial('produto_id').primaryKey(),
  ...auditFields,
  nome:          varchar('nome', { length: 200 }).notNull(),
  descricao:     varchar('descricao', { length: 500 }),
  codigoBarras:  varchar('codigo_barras', { length: 50 }),
  unidade:       varchar('unidade', { length: 20 }).notNull().default('un'),
  categoria:     varchar('categoria', { length: 100 }),
  estoqueAtual:  integer('estoque_atual').notNull().default(0),
  estoqueMinimo: integer('estoque_minimo').notNull().default(0),
  precoCusto:    integer('preco_custo').notNull().default(0),
  precoVarejo:   integer('preco_varejo').notNull().default(0),
  precoAtacado:  integer('preco_atacado').notNull().default(0),
})
export type TpDbProdutoRow    = InferSelectModel<typeof dbProduto>
export type TpDbProdutoInsert = InferInsertModel<typeof dbProduto>
export type TpDbProdutoUpdate = Partial<Omit<TpDbProdutoInsert, 'produtoId' | 'createdDt' | 'createdBy'>>

// ─── Insumos ──────────────────────────────────────────────────────────────────
export const dbInsumo = pgTable('t_insumo', {
  insumoId:      serial('insumo_id').primaryKey(),
  ...auditFields,
  nome:          varchar('nome', { length: 200 }).notNull(),
  descricao:     varchar('descricao', { length: 500 }),
  codigoBarras:  varchar('codigo_barras', { length: 50 }),
  unidade:       varchar('unidade', { length: 20 }).notNull().default('kg'),
  tipo:          varchar('tipo', { length: 20 }).notNull().default('MP'),
  estoqueAtual:  integer('estoque_atual').notNull().default(0),
  estoqueMinimo: integer('estoque_minimo').notNull().default(0),
  precoCusto:    integer('preco_custo').notNull().default(0),
  fornecedorId:  integer('fornecedor_id'),
})
export type TpDbInsumoRow    = InferSelectModel<typeof dbInsumo>
export type TpDbInsumoInsert = InferInsertModel<typeof dbInsumo>
export type TpDbInsumoUpdate = Partial<Omit<TpDbInsumoInsert, 'insumoId' | 'createdDt' | 'createdBy'>>

// ─── Usuários ─────────────────────────────────────────────────────────────────
export const dbUsuario = pgTable('t_usuario', {
  usuarioId:  serial('usuario_id').primaryKey(),
  ...auditFields,
  clerkId:    varchar('clerk_id', { length: 200 }).notNull().unique(),
  nome:       varchar('nome', { length: 200 }).notNull(),
  email:      varchar('email', { length: 150 }).notNull(),
  perfil:     varchar('perfil', { length: 20 }).notNull().default('user'),
  userLogin:  varchar('user_login', { length: 100 }),
})
export type TpDbUsuarioRow    = InferSelectModel<typeof dbUsuario>
export type TpDbUsuarioInsert = InferInsertModel<typeof dbUsuario>