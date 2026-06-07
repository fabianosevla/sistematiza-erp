import { pgTable, serial, integer, varchar, boolean, timestamp, date, text } from 'drizzle-orm/pg-core'
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm'

export const dbPlanoAcao = pgTable('t_plano_acao', {
  acaoId:          serial('acao_id').primaryKey(),
  modificationNum: integer('modification_num').notNull().default(0),
  createdDt:       timestamp('created_dt', { withTimezone: true }).notNull(),
  createdBy:       integer('created_by').notNull(),
  updatedDt:       timestamp('updated_dt', { withTimezone: true }).notNull(),
  updatedBy:       integer('updated_by').notNull(),
  activeFlag:      boolean('active_flg').notNull().default(true),
  dataAcao:        date('data_acao').notNull(),
  identificacao:   varchar('identificacao', { length: 200 }).notNull(),
  acao:            text('acao').notNull(),
  responsavel:     varchar('responsavel', { length: 100 }),
  status:          varchar('status', { length: 20 }).notNull().default('pendente'),
  concluidoEm:     timestamp('concluido_em', { withTimezone: true }),
})

export type TpDbPlanoAcaoRow    = InferSelectModel<typeof dbPlanoAcao>
export type TpDbPlanoAcaoInsert = InferInsertModel<typeof dbPlanoAcao>