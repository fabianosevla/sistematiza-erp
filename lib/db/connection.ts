import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool, PoolClient } from 'pg'
import * as publicSchema     from './schemas/public'
import * as cadastrosSchema  from './schemas/cadastros'
import * as estoqueSchema    from './schemas/estoque'
import * as vendasSchema     from './schemas/vendas'
import * as financeiroSchema from './schemas/financeiro'
import * as producaoSchema   from './schemas/producao'
import * as fiscalSchema     from './schemas/fiscal'

const pool = new Pool({
  host:     process.env.DB_HOST!,
  port:     Number(process.env.DB_PORT ?? 5432),
  database: process.env.DB_NAME!,
  user:     process.env.DB_USER!,
  password: process.env.DB_PASSWORD!,
  ssl:      { rejectUnauthorized: false },
  max:      20,
  idleTimeoutMillis:       30000,
  connectionTimeoutMillis: 5000,
})

pool.on('error', (err) => console.error('[sistematiza.erp] Pool error:', err))

export const allSchemas = {
  ...publicSchema,
  ...cadastrosSchema,
  ...estoqueSchema,
  ...vendasSchema,
  ...financeiroSchema,
  ...producaoSchema,
  ...fiscalSchema,
}

export type AppDB = ReturnType<typeof drizzle<typeof allSchemas>>

export async function getDbForTenant(schemaName: string): Promise<{ db: AppDB; release: () => void }> {
  const client: PoolClient = await pool.connect()
  await client.query(`SET search_path TO "${schemaName}", public`)
  const db = drizzle(client, { schema: allSchemas }) as AppDB
  return { db, release: () => client.release() }
}

export async function getPublicDb(): Promise<{ db: ReturnType<typeof drizzle<typeof publicSchema>>; release: () => void }> {
  const client: PoolClient = await pool.connect()
  const db = drizzle(client, { schema: publicSchema })
  return { db, release: () => client.release() }
}

export { pool }