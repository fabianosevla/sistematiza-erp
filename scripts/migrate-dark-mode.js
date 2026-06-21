require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')
const pool = new Pool({ host: process.env.DB_HOST, port: 5432, database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD, ssl: { rejectUnauthorized: false } })
const SCHEMA = 'tenant_zaghi_massas_caseiras'

pool.connect().then(async client => {
  console.log(`\nGarantindo coluna dark_mode no schema: ${SCHEMA}\n`)
  await client.query(`SET search_path TO "${SCHEMA}", public`)
  await client.query(`ALTER TABLE t_configuracoes_tenant ADD COLUMN IF NOT EXISTS dark_mode BOOLEAN NOT NULL DEFAULT FALSE`)
  console.log('✓ dark_mode confirmada (idempotente)')
  console.log('\n✅ Concluído!\n')
  client.release(); pool.end()
}).catch(err => { console.error('Erro:', err.message); process.exit(1) })