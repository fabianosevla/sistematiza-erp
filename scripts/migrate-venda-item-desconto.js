/**
 * Desconto por item na venda.
 * t_venda_item: + coluna desconto (centavos, default 0)
 *
 * Idempotente, aplica em todos os schemas de tenant.
 * Rodar: node scripts/migrate-venda-item-desconto.js
 */
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

const pool = new Pool({
  host: process.env.DB_HOST, port: 5432,
  database: process.env.DB_NAME, user: process.env.DB_USER,
  password: process.env.DB_PASSWORD, ssl: { rejectUnauthorized: false },
})

pool.connect().then(async client => {
  const res = await client.query(`
    SELECT schema_name FROM information_schema.schemata
    WHERE schema_name LIKE 'tenant_%' ORDER BY schema_name
  `)
  const schemas = res.rows.map(r => r.schema_name)
  console.log(`\nDesconto por item em ${schemas.length} schema(s)...\n`)

  for (const schema of schemas) {
    try {
      await client.query(`SET search_path TO "${schema}", public`)
      await client.query(`ALTER TABLE t_venda_item ADD COLUMN IF NOT EXISTS desconto INTEGER NOT NULL DEFAULT 0`)
      console.log(`  ✓ ${schema}`)
    } catch (e) {
      console.error(`  ✗ ${schema}: ${e.message}`)
    }
  }

  console.log('\n✅ Migration concluída!\n')
  client.release()
  pool.end()
}).catch(err => { console.error('Erro:', err.message); process.exit(1) })