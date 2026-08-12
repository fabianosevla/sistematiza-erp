// ESTE ARQUIVO VAI EM: lib/db/schemas/cadastros.ts
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
  // Tabela de preço padrão do cliente: varejo | atacado_a … atacado_e.
  // O PDV e o VendaService leem daqui para escolher o preço do produto —
  // ver TIPOS_PRECO em lib/constants.ts e scripts/migrate-cliente-tabela-preco.js
  tabelaPreco:  varchar('tabela_preco', { length: 20 }).notNull().default('varejo'),
  // ── FISCAL ──────────────────────────────────────────────────────────────
  //
  // As colunas existiam desde scripts/migrate-fiscal-parametrizacao.js e não
  // estavam declaradas aqui — então a edição do cliente nunca as gravava.
  //
  // indicadorIe: 1 contribuinte · 2 isento · 9 não contribuinte. Decide se a
  // NF-e leva inscrição estadual do destinatário, e o CFOP da operação.
  inscricaoEstadual: varchar('inscricao_estadual', { length: 20 }),
  indicadorIe:       varchar('indicador_ie', { length: 1 }).default('9'),
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
  produtoId:      serial('produto_id').primaryKey(),
  ...auditFields,
  nome:           varchar('nome', { length: 200 }).notNull(),
  descricao:      varchar('descricao', { length: 500 }),
  codigoBarras:   varchar('codigo_barras', { length: 50 }),
  unidade:        varchar('unidade', { length: 20 }).notNull().default('un'),
  categoria:      varchar('categoria', { length: 100 }),
  tipo:           varchar('tipo', { length: 100 }),
  estoqueAtual:   integer('estoque_atual').notNull().default(0),
  estoqueMinimo:  integer('estoque_minimo').notNull().default(0),
  precoCusto:     integer('preco_custo').notNull().default(0),
  precoVarejo:    integer('preco_varejo').notNull().default(0),
  // Produto que também é insumo de outros produtos (ver migrate-produto-insumo-flg.js)
  insumoFlg:      boolean('insumo_flg').notNull().default(false),
  // Produto para revenda — flag própria, independente do tipo. Um produto
  // pode ser "Bebida" E revenda ao mesmo tempo. Produtos de revenda não
  // aparecem na grade de Produção (ver migrate-produto-revenda.js).
  revenda:        boolean('revenda').notNull().default(false),
  // Atacado legado (mantido para retrocompatibilidade)
  precoAtacado:   integer('preco_atacado').notNull().default(0),
  // Tabelas de preço atacado por canal B2B (A=mercados pequenos … E=grandes redes)
  precoAtacadoA:  integer('preco_atacado_a').notNull().default(0),
  precoAtacadoB:  integer('preco_atacado_b').notNull().default(0),
  precoAtacadoC:  integer('preco_atacado_c').notNull().default(0),
  precoAtacadoD:  integer('preco_atacado_d').notNull().default(0),
  precoAtacadoE:  integer('preco_atacado_e').notNull().default(0),

  // ── FISCAIS ──────────────────────────────────────────────────────────────
  // Descrevem a MERCADORIA: o que ela é para o fisco. Como ela é tributada —
  // CFOP, CSOSN, alíquotas — vem do perfil apontado por perfilTribId.
  //
  // Ficam nulos até o contador classificar. A empresa opera sem eles; só a
  // emissão de nota é barrada, pelo ProntidaoFiscalService.
  // Ver scripts/migrate-fiscal-parametrizacao.js
  ncm:               varchar('ncm', { length: 10 }),
  cest:              varchar('cest', { length: 10 }),
  origem:            varchar('origem', { length: 1 }).default('0'),
  unidadeTributavel: varchar('unidade_tributavel', { length: 6 }),
  perfilTribId:      integer('perfil_trib_id'),

  // ── CARDÁPIO ONLINE ──────────────────────────────────────────────────────
  // Foto sobe pro Vercel Blob (Vercel não tem disco persistente); a coluna
  // só guarda a URL. disponivelCardapio decide se o produto aparece no link
  // público — cadastrado não significa exposto.
  fotoUrl:            varchar('foto_url', { length: 500 }),
  disponivelCardapio: boolean('disponivel_cardapio').notNull().default(false),
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
  // 100 caracteres e valor por extenso, igual ao tipo de produto. Era
  // varchar(20) com default 'MP', e isso gerava duas grafias para a mesma
  // coisa: importado nascia 'MP', cadastrado pela tela nascia 'Matéria Prima'.
  // Ver scripts/normalizar-dominios.js e scripts/migrate-insumo-tipo.js
  tipo:          varchar('tipo', { length: 100 }).notNull().default('Matéria Prima'),
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