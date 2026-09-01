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

  // CFOP muda conforme o destino da mercadoria. Com origemMercadoria
  // preenchida, estes dois campos passam a ser CALCULADOS (ver
  // lib/fiscal/cfopVenda.ts) em vez de digitados — evita que "tem ST" e o
  // CFOP fiquem contando histórias diferentes. Perfil sem origem
  // preenchida (legado) continua usando o que estiver aqui, digitado.
  cfopInterno:       varchar('cfop_interno', { length: 4 }),
  cfopInterestadual: varchar('cfop_interestadual', { length: 4 }),
  // producao_propria | revenda — null = perfil legado, CFOP fica manual.
  origemMercadoria:  varchar('origem_mercadoria', { length: 20 }),

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

// REGRAS DE CFOP — para operações que NÃO são venda.
//
// Venda continua resolvida pelo perfil tributário: o CFOP de venda depende do
// produto (cada um tem seu perfil). Aqui é o contrário — devolução,
// bonificação, transferência, remessa para industrialização/conserto,
// consignação, compra de uso/consumo e de ativo não dependem do produto, só
// do tipo de operação e de a mercadoria ir para dentro ou fora do estado.
//
// `tipoOperacao` é texto livre (não enum fixo no código): o contador cadastra
// uma operação nova pela tela sem precisar de deploy. Ver scripts/migrate-cfop-regras.js
export const dbCfopRegra = pgTable('t_cfop_regra', {
  cfopRegraId:  serial('cfop_regra_id').primaryKey(),
  ...auditFields,
  tipoOperacao: varchar('tipo_operacao', { length: 100 }).notNull(),
  // entrada | saida
  direcao:      varchar('direcao', { length: 10 }).notNull(),
  // interno | interestadual
  localizacao:  varchar('localizacao', { length: 15 }).notNull(),
  cfop:         varchar('cfop', { length: 4 }).notNull(),
  observacao:   varchar('observacao', { length: 500 }),
  // CSOSN/CST sugerido pra essa operação — sem isso, "registrar a operação"
  // não tem como gerar nota (falta parametrização, mesma trava de sempre).
  // "Sugerido" porque é chute de mercado até o contador confirmar, igual
  // ao resto do que este módulo semeia sem confirmação.
  csosnSugerido: varchar('csosn_sugerido', { length: 4 }),
  cstSugerido:   varchar('cst_sugerido', { length: 3 }),
})

// NCM DE REFERÊNCIA — busca por palavra-chave pra ajudar a classificar
// produto novo. Curada (não é a tabela oficial completa, ~10 mil códigos),
// cresce conforme alguém cadastra — mesmo espírito de t_cfop_regra.
export const dbNcmReferencia = pgTable('t_ncm_referencia', {
  ncmRefId:     serial('ncm_ref_id').primaryKey(),
  ...auditFields,
  ncm:          varchar('ncm', { length: 10 }).notNull(),
  descricao:    varchar('descricao', { length: 400 }).notNull(),
  cestSugerido: varchar('cest_sugerido', { length: 20 }),
  fonte:        varchar('fonte', { length: 300 }),
})

// MVA/ICMS-ST POR ESTADO DE DESTINO.
//
// O perfil tributário tem um mva/aliq_icms_st ÚNICO — mas MVA de verdade é
// definido por protocolo/convênio ESTADUAL, muda de UF pra UF e ao longo do
// tempo por portaria. Um perfil por estado seria repetir CFOP/CSOSN/PIS/
// COFINS 27 vezes só pra mudar um número; esta tabela guarda só a exceção
// por estado, e cai no valor do perfil quando não houver linha aqui —
// mesmo comportamento de antes de existir, preservado como padrão.
export const dbIcmsStUf = pgTable('t_icms_st_uf', {
  icmsStUfId:   serial('icms_st_uf_id').primaryKey(),
  ...auditFields,
  perfilTribId: integer('perfil_trib_id').notNull(),
  ufDestino:    varchar('uf_destino', { length: 2 }).notNull(),
  // null = herda o "tem ST" do perfil (comportamento de sempre). true/false
  // = esse estado específico diverge do perfil — o protocolo de ST é
  // estadual, nem todo estado aderiu ao mesmo.
  temSt:        boolean('tem_st'),
  mva:          numeric('mva', { precision: 6, scale: 2 }).notNull().default('0'),
  aliqIcmsSt:   numeric('aliq_icms_st', { precision: 5, scale: 2 }).notNull().default('0'),
  // De onde veio o número (protocolo, portaria, data). MVA sem fonte é MVA
  // que ninguém sabe se ainda vale quando a legislação mudar.
  fonte:        varchar('fonte', { length: 300 }),
  observacao:   varchar('observacao', { length: 500 }),
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
  // ENDEREÇO DO DESTINATÁRIO — obrigatório na NF-e modelo 55.
  //
  // A nota guardava só CNPJ, razão social e UF. A SEFAZ exige o destinatário
  // inteiro, e sem isso toda nota de pedido seria rejeitada.
  //
  // Fica congelado aqui, e não buscado no cadastro na hora de emitir: o
  // cliente pode mudar de endereço depois, e a nota tem que continuar
  // contando a história que era verdade no dia da saída.
  indicadorIe:         varchar('indicador_ie', { length: 1 }),
  cep:                 varchar('cep', { length: 10 }),
  logradouro:          varchar('logradouro', { length: 200 }),
  // `numero_dest`, e não `numero`: a tabela já tem `numero`, que é o número
  // DA NOTA. Com o mesmo nome, o endereço não teria onde ser gravado e a
  // emissão mandaria o número da nota como número da rua.
  numeroDest:          varchar('numero_dest', { length: 20 }),
  complemento:         varchar('complemento', { length: 100 }),
  bairro:              varchar('bairro', { length: 100 }),
  municipio:           varchar('municipio', { length: 100 }),
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
  // Liga a nota à regra de "outras operações" que a originou — só existe
  // pra devolução/transferência/bonificação etc.; venda normal fica NULL,
  // porque essa vem do perfil tributário do produto, não daqui.
  cfopRegraId:         integer('cfop_regra_id'),
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
  // Congelados junto com a base e o valor. Sem as duas taxas o payload da
  // emissão não consegue remontar o grupo de ST, e a SEFAZ exige o grupo
  // inteiro — não só o valor final.
  mva:            numeric('mva', { precision: 6, scale: 2 }).notNull().default('0'),
  aliqSt:         numeric('aliq_st', { precision: 5, scale: 2 }).notNull().default('0'),
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
export type TpDbCfopRegraRow           = InferSelectModel<typeof dbCfopRegra>
export type TpDbCfopRegraInsert        = InferInsertModel<typeof dbCfopRegra>
export type TpDbIcmsStUfRow            = InferSelectModel<typeof dbIcmsStUf>
export type TpDbIcmsStUfInsert         = InferInsertModel<typeof dbIcmsStUf>
export type TpDbNcmReferenciaRow       = InferSelectModel<typeof dbNcmReferencia>
export type TpDbNcmReferenciaInsert    = InferInsertModel<typeof dbNcmReferencia>