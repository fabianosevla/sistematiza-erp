import {
  pgTable,
  serial,
  integer,
  varchar,
  boolean,
  timestamp,
} from 'drizzle-orm/pg-core'
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm'

// ─── Tenant (public schema) ───────────────────────────────────────────────────
export const dbTenant = pgTable('t_tenant', {
  tenantId:        serial('tenant_id').primaryKey(),
  modificationNum: integer('modification_num').notNull().default(0),
  createdDt:       timestamp('created_dt', { withTimezone: true }).notNull(),
  updatedDt:       timestamp('updated_dt', { withTimezone: true }).notNull(),
  activeFlag:      boolean('active_flg').notNull().default(true),

  slug:            varchar('slug', { length: 100 }).notNull().unique(),
  name:            varchar('name', { length: 200 }).notNull(),
  schemaName:      varchar('schema_name', { length: 100 }).notNull().unique(),
  ownerClerkId:    varchar('owner_clerk_id', { length: 200 }).notNull(),
  plan:            varchar('plan', { length: 50 }).notNull().default('starter'),
})

export type TpDbTenantRow    = InferSelectModel<typeof dbTenant>
export type TpDbTenantInsert = InferInsertModel<typeof dbTenant>
