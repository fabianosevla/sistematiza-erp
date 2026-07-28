/**
 * Migration: mais casas decimais na quantidade da ficha técnica.
 * t_produto_insumo.quantidade: NUMERIC(10,3) → NUMERIC(12,6)
 *
 * Motivo: insumos usados em quantidade muito pequena por unidade (ex.: orégano
 * a 0,00027 kg por bandeja) eram arredondados para 0,000 — distorcendo custo
 * e baixa de estoque. Com 6 casas o valor real é preservado.
 *
 * Idempotente e aplica em TODOS os schemas de tenant.
 * Rodar: node scripts/migrate-ficha-decimais.js
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
  console.log(`\nFicha técnica — ampliando casas decimais em ${schemas.length} schema(s)...\n`)

  for (const schema of schemas) {
    try {
      await client.query(`SET search_path TO "${schema}", public`)
      await client.query(`ALTER TABLE t_produto_insumo ALTER COLUMN quantidade TYPE NUMERIC(12,6)`)
      console.log(`  ✓ ${schema}`)
    } catch (e) {
      console.error(`  ✗ ${schema}: ${e.message}`)
    }
  }

  console.log('\n✅ Migration concluída!\n')
  client.release()
  pool.end()
}).catch(err => { console.error('Erro:', err.message); process.exit(1) })