// ESTE ARQUIVO VAI EM: lib/db/schemas/vendas.ts
import { pgTable, serial, integer, varchar, boolean, timestamp } from 'drizzle-orm/pg-core'
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm'

const auditFields = {
  modificationNum: integer('modification_num').notNull().default(0),
  createdDt:       timestamp('created_dt', { withTimezone: true }).notNull(),
  createdBy:       integer('created_by').notNull(),
  updatedDt:       timestamp('updated_dt', { withTimezone: true }).notNull(),
  updatedBy:       integer('updated_by').notNull(),
  activeFlag:      boolean('active_flg').notNull().default(true),
}

export const dbConfiguracoesTenant = pgTable('t_configuracoes_tenant', {
  configId:          serial('config_id').primaryKey(),
  modificationNum:   integer('modification_num').notNull().default(0),
  createdDt:         timestamp('created_dt', { withTimezone: true }).notNull(),
  updatedDt:         timestamp('updated_dt', { withTimezone: true }).notNull(),
  activeFlag:        boolean('active_flg').notNull().default(true),
  // Módulos toggleáveis
  comandasAtivo:     boolean('comandas_ativo').notNull().default(false),
  producaoAtivo:     boolean('producao_ativo').notNull().default(true),
  estoqueAtivo:      boolean('estoque_ativo').notNull().default(true),
  fiscalAtivo:       boolean('fiscal_ativo').notNull().default(false),
  // Controle de caixa: abrir com um valor, vender, fechar conferindo.
  // Chave PRÓPRIA, e não carona no fiscal: NFC-e não exige turno, e quem não
  // emite nota pode querer o controle mesmo assim.
  // Ver scripts/migrate-turno-caixa.js
  turnoCaixaAtivo:   boolean('turno_caixa_ativo').notNull().default(false),
  // Quantos computadores vendem. Com 1, o PDV assume o caixa 1 e não pergunta.
  qtdCaixas:         integer('qtd_caixas').notNull().default(1),
  // dia | operador — ver lib/services/caixa/CaixaService.ts
  regimeTurno:       varchar('regime_turno', { length: 10 }).notNull().default('dia'),
  consultasAtivo:    boolean('consultas_ativo').notNull().default(true),
  pedidosAtivo:      boolean('pedidos_ativo').notNull().default(true),
  planoAcaoAtivo:    boolean('plano_acao_ativo').notNull().default(true),
  metasAtivo:        boolean('metas_ativo').notNull().default(true),
  // Cardápio digital público (link/QR Code, sem login). Piloto: só a Zaghi
  // liga. Desligado por padrão para não expor rota pública sem decisão.
  cardapioAtivo:     boolean('cardapio_ativo').notNull().default(false),
  // Layout e comportamento do cardápio — ver scripts/migrate-cardapio-layout.js
  cardapioMensagemBoasVindas: varchar('cardapio_mensagem_boas_vindas', { length: 300 }),
  cardapioCorDestaque:        varchar('cardapio_cor_destaque', { length: 9 }),
  // WhatsApp da loja pra onde o pedido monta a mensagem — não é o telefone
  // fixo da empresa necessariamente, por isso é campo próprio.
  cardapioWhatsapp:           varchar('cardapio_whatsapp', { length: 20 }),
  cardapioPermiteEntrega:     boolean('cardapio_permite_entrega').notNull().default(true),
  cardapioPermiteBalcao:      boolean('cardapio_permite_balcao').notNull().default(true),
  // Dados da empresa
  nomeEmpresa:       varchar('nome_empresa', { length: 200 }),
  cnpj:              varchar('cnpj', { length: 20 }),
  telefone:          varchar('telefone', { length: 20 }),
  endereco:          varchar('endereco', { length: 300 }),
  logoUrl:           varchar('logo_url', { length: 500 }),
  ieEstadual:        varchar('ie_estadual', { length: 30 }),
  regimeTributario:  varchar('regime_tributario', { length: 5 }),
  uf:                varchar('uf', { length: 2 }),
  focusNfeToken:     varchar('focus_nfe_token', { length: 200 }),
  focusNfeAmbiente:  varchar('focus_nfe_ambiente', { length: 20 }).default('homologacao'),
})

export const dbComanda = pgTable('t_comanda', {
  comandaId:      serial('comanda_id').primaryKey(),
  ...auditFields,
  identificacao:  varchar('identificacao', { length: 100 }).notNull(),
  clienteId:      integer('cliente_id'),
  // Cliente avulso — ver scripts/migrate-venda-cliente-avulso.js
  nomeClienteAvulso: varchar('nome_cliente_avulso', { length: 200 }),
  status:         varchar('status', { length: 20 }).notNull().default('aberta'),
  observacao:     varchar('observacao', { length: 500 }),
  desconto:       integer('desconto').notNull().default(0),
  total:          integer('total').notNull().default(0),
  vendaId:        integer('venda_id'),
  abertaEm:       timestamp('aberta_em', { withTimezone: true }).notNull(),
  fechadaEm:      timestamp('fechada_em', { withTimezone: true }),
})

export const dbComandaItem = pgTable('t_comanda_item', {
  itemId:        serial('item_id').primaryKey(),
  ...auditFields,
  comandaId:     integer('comanda_id').notNull(),
  produtoId:     integer('produto_id').notNull(),
  nomeProduto:   varchar('nome_produto', { length: 200 }).notNull(),
  quantidade:    integer('quantidade').notNull().default(1),
  precoUnitario: integer('preco_unitario').notNull(),
  subtotal:      integer('subtotal').notNull(),
  observacao:    varchar('observacao', { length: 200 }),
})

export const dbVenda = pgTable('t_venda', {
  vendaId:           serial('venda_id').primaryKey(),
  ...auditFields,
  origem:            varchar('origem', { length: 20 }).notNull().default('direta'),
  comandaId:         integer('comanda_id'),
  clienteId:         integer('cliente_id'),
  // Cliente avulso: quem compra uma vez e não vale cadastrar. É só um nome —
  // sem histórico, sem tabela de preço e sem cashback, porque o programa de
  // fidelidade depende de cliente_id.
  // Ver scripts/migrate-venda-cliente-avulso.js
  nomeClienteAvulso: varchar('nome_cliente_avulso', { length: 200 }),
  status:            varchar('status', { length: 20 }).notNull().default('concluida'),
  tipoEntrega:       varchar('tipo_entrega', { length: 20 }).notNull().default('retirada'),
  dataEntrega:       timestamp('data_entrega', { withTimezone: true }),
  enderecoEntrega:   varchar('endereco_entrega', { length: 300 }),
  subtotal:          integer('subtotal').notNull().default(0),
  desconto:          integer('desconto').notNull().default(0),
  total:             integer('total').notNull().default(0),
  observacao:        varchar('observacao', { length: 500 }),
  observacaoInterna: varchar('observacao_interna', { length: 500 }),
  vendedor:          varchar('vendedor', { length: 100 }),
  // nenhum | nfce | nfe — decidido no fechamento da venda.
  //
  // Separa o que foi faturado do que não foi. É informação GERENCIAL: não
  // emite nada por si, só registra a intenção. A emissão de verdade acontece
  // no módulo Fiscal, e depende de parametrização e credenciamento.
  // Ver scripts/migrate-fiscal-parametrizacao.js
  documentoFiscal:   varchar('documento_fiscal', { length: 10 }).notNull().default('nenhum'),
  // Sair na impressora depois de autorizada. Emitir é obrigação fiscal;
  // imprimir é a via de papel para o cliente, e nem todo cliente quer.
  imprimirNota:      boolean('imprimir_nota').notNull().default(false),
  // De qual caixa e de qual turno saiu esta venda.
  //
  // Sem isto, o fechamento sabe que a loja ficou R$ 50 curta mas não em qual
  // máquina — e, com vários turnos abertos ao mesmo tempo, um relatório que
  // filtra por horário mostraria o faturamento da loja inteira em cada caixa.
  // Ver scripts/migrate-caixa-e-fiscal.js
  turnoId:           integer('turno_id'),
  numeroCaixa:       integer('numero_caixa'),
  // NÃO declarar `regime_turno` aqui. O regime é da EMPRESA, e vive em
  // t_configuracoes_tenant — a venda só guarda de qual turno e de qual caixa
  // ela saiu.
  //
  // Declarar coluna que não existe na tabela não é engano inofensivo: o
  // Drizzle monta o INSERT com TODAS as colunas declaradas, usando DEFAULT
  // para as que não foram passadas. Uma coluna fantasma quebra toda inserção
  // na tabela — foi o que derrubou o PDV inteiro com erro 42703.
  vendidaEm:         timestamp('vendida_em', { withTimezone: true }).notNull(),
})

export const dbVendaItem = pgTable('t_venda_item', {
  itemId:        serial('item_id').primaryKey(),
  ...auditFields,
  vendaId:       integer('venda_id').notNull(),
  produtoId:     integer('produto_id').notNull(),
  nomeProduto:   varchar('nome_produto', { length: 200 }).notNull(),
  desconto:      integer('desconto').notNull().default(0),
  quantidade:    integer('quantidade').notNull().default(1),
  precoUnitario: integer('preco_unitario').notNull(),
  subtotal:      integer('subtotal').notNull(),
})

export const dbVendaPagamento = pgTable('t_venda_pagamento', {
  pagamentoId: serial('pagamento_id').primaryKey(),
  ...auditFields,
  vendaId:     integer('venda_id').notNull(),
  forma:       varchar('forma', { length: 50 }).notNull(),
  valor:       integer('valor').notNull(),
})

export type TpDbConfiguracoesTenantRow = InferSelectModel<typeof dbConfiguracoesTenant>
export type TpDbComandaRow             = InferSelectModel<typeof dbComanda>
export type TpDbComandaInsert          = InferInsertModel<typeof dbComanda>
export type TpDbComandaItemRow         = InferSelectModel<typeof dbComandaItem>
export type TpDbComandaItemInsert      = InferInsertModel<typeof dbComandaItem>
export type TpDbVendaRow               = InferSelectModel<typeof dbVenda>
export type TpDbVendaInsert            = InferInsertModel<typeof dbVenda>
export type TpDbVendaItemRow           = InferSelectModel<typeof dbVendaItem>
export type TpDbVendaItemInsert        = InferInsertModel<typeof dbVendaItem>
export type TpDbVendaPagamentoRow      = InferSelectModel<typeof dbVendaPagamento>
export type TpDbVendaPagamentoInsert   = InferInsertModel<typeof dbVendaPagamento>