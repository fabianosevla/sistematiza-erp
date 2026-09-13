// lib/db/schemas/crm.schema.ts
//
// Módulo CRM (13/09/2026) — funil B2B, rastreio de funil do cardápio digital
// e log de campanha. A Fidelidade (cashback/reativação) NÃO está aqui — ela
// continua em fidelidade.schema.ts, só passou a aparecer como uma aba dentro
// da tela de CRM (ver components/modules/crm/CrmView.tsx). Zero mudança na
// lógica dela.
import {
  pgTable, serial, integer, varchar, boolean, timestamp, date, text,
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

// ─── Funil B2B — prospecção de mercado/restaurante ──────────────────────────
//
// Não é extensão do Plano de Ação (t_plano_acao): aquilo é lista de tarefa
// genérica, sem cliente, sem estágio, sem valor de negócio. Um lead de
// verdade tem forma diferente — daí tabela própria.
export const dbCrmLead = pgTable('t_crm_lead', {
  leadId:          serial('lead_id').primaryKey(),
  ...auditFields,
  nomeEmpresa:     varchar('nome_empresa', { length: 200 }).notNull(),
  contatoNome:     varchar('contato_nome', { length: 100 }),
  telefone:        varchar('telefone', { length: 20 }),
  email:           varchar('email', { length: 150 }),
  // Setado quando o lead vira cliente de fato (cadastro em Cadastros → Clientes).
  clienteId:       integer('cliente_id'),
  origem:          varchar('origem', { length: 30 }).notNull().default('prospeccao'),
  // novo | contatado | negociando | proposta | ganho | perdido
  estagio:         varchar('estagio', { length: 20 }).notNull().default('novo'),
  valorEstimadoCentavos: integer('valor_estimado_centavos').notNull().default(0),
  motivoPerda:     varchar('motivo_perda', { length: 200 }),
  // Texto livre, mesmo padrão de t_venda.vendedor e t_plano_acao.responsavel
  // — não existe FK pra usuário em lugar nenhum do sistema hoje.
  responsavel:     varchar('responsavel', { length: 100 }),
  // DATA PURA: dia escolhido num <input type="date">, sem hora — nunca
  // passa por conversão de fuso na exibição (fmtData, não fmtDataLocal).
  proximaAcaoData: date('proxima_acao_data'),
  observacao:      text('observacao'),
  // MOMENTO: preenchido automaticamente pelo sistema na troca de estágio —
  // agrupar isso por dia/mês no SQL exige AT TIME ZONE 'America/Sao_Paulo'.
  ganhoEm:         timestamp('ganho_em', { withTimezone: true }),
  perdidoEm:       timestamp('perdido_em', { withTimezone: true }),
})
export type TpDbCrmLeadRow    = InferSelectModel<typeof dbCrmLead>
export type TpDbCrmLeadInsert = InferInsertModel<typeof dbCrmLead>
export type TpDbCrmLeadUpdate = Partial<Omit<TpDbCrmLeadInsert, 'leadId' | 'createdDt' | 'createdBy'>>

// ─── Funil do cardápio digital — visualização e pedido montado ─────────────
//
// Não dá pra saber com certeza "quantos compraram" (o pedido vira mensagem
// de WhatsApp, a venda de verdade é lançada à mão depois, sem vínculo
// automático) — por isso aqui só existe o que é realmente mensurável.
// "Vendas confirmadas" é calculado à parte, contando t_pedido com
// origem = 'cardapio' que já viraram venda — não vem desta tabela.
export const dbCardapioEvento = pgTable('t_cardapio_evento', {
  eventoId:    serial('evento_id').primaryKey(),
  ...auditFields,
  tipo:        varchar('tipo', { length: 20 }).notNull(), // visualizacao | pedido_montado
  ipHash:      varchar('ip_hash', { length: 64 }),         // hash, não IP cru
  // MOMENTO: instante real do evento — agrupamento por dia sempre com
  // AT TIME ZONE 'America/Sao_Paulo' antes de truncar.
  ocorridoEm:  timestamp('ocorrido_em', { withTimezone: true }).notNull(),
})
export type TpDbCardapioEventoRow    = InferSelectModel<typeof dbCardapioEvento>
export type TpDbCardapioEventoInsert = InferInsertModel<typeof dbCardapioEvento>

// ─── Log de envio de campanha ────────────────────────────────────────────────
//
// Paralelo ao t_fidelidade_aviso, mas próprio: campanha é mais ampla que
// reativação por inatividade (pode ser qualquer público — segmento,
// seleção manual). Reaproveita o mesmo WhatsAppService.enviarTemplate.
export const dbCrmCampanhaEnvio = pgTable('t_crm_campanha_envio', {
  envioId:       serial('envio_id').primaryKey(),
  ...auditFields,
  clienteId:     integer('cliente_id').notNull(),
  campanhaNome:  varchar('campanha_nome', { length: 150 }).notNull(),
  enviadoEm:     timestamp('enviado_em', { withTimezone: true }), // MOMENTO
  status:        varchar('status', { length: 20 }).notNull().default('enviado'), // enviado | erro
  erroMsg:       varchar('erro_msg', { length: 500 }),
  waMessageId:   varchar('wa_message_id', { length: 150 }),
})
export type TpDbCrmCampanhaEnvioRow    = InferSelectModel<typeof dbCrmCampanhaEnvio>
export type TpDbCrmCampanhaEnvioInsert = InferInsertModel<typeof dbCrmCampanhaEnvio>
