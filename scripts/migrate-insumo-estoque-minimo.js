/**
 * Migration: estoque mínimo de insumo aceita fração.
 * t_insumo.estoque_minimo: INTEGER → NUMERIC(14,4)
 *
 * Motivo: insumos vendidos/controlados por peso precisam de mínimo fracionado
 * (ex.: 0,250 kg de orégano). Com INTEGER só era possível 1, 2, 3...
 * Reforça também estoque_atual como NUMERIC(14,4) (idempotente — já migrado
 * anteriormente por scripts/migrate-insumo-decimal.js).
 *
 * Aplica em TODOS os schemas de tenant.
 * Rodar: node scripts/migrate-insumo-estoque-minimo.js
 */
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     5432,
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl:      { rejectUnauthorized: false },
})

pool.connect().then(async client => {
  const res = await client.query(`
    SELECT schema_name FROM information_schema.schemata
    WHERE schema_name LIKE 'tenant_%'
    ORDER BY schema_name
  `)
  const schemas = res.rows.map(r => r.schema_name)
  console.log(`\nInsumos — estoque fracionado em ${schemas.length} schema(s)...\n`)

  for (const schema of schemas) {
    try {
      await client.query(`SET search_path TO "${schema}", public`)
      await client.query(`ALTER TABLE t_insumo ALTER COLUMN estoque_minimo TYPE NUMERIC(14,4)`)
      await client.query(`ALTER TABLE t_insumo ALTER COLUMN estoque_atual  TYPE NUMERIC(14,4)`)
      console.log(`  ✓ ${schema}`)
    } catch (e) {
      console.error(`  ✗ ${schema}: ${e.message}`)
    }
  }

  console.log('\n✅ Migration concluída!\n')
  client.release()
  pool.end()
}).catch(err => { console.error('Erro:', err.message); process.exit(1) })