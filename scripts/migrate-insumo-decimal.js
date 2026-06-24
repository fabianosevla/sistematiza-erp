require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')
const pool = new Pool({ host: process.env.DB_HOST, port: 5432, database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD, ssl: { rejectUnauthorized: false } })
const SCHEMA = 'tenant_zaghi_massas_caseiras'
pool.connect().then(async client => {
  await client.query(`SET search_path TO "${SCHEMA}", public`)
  await client.query(`ALTER TABLE t_insumo ALTER COLUMN estoque_atual TYPE NUMERIC(14,4)`)
  console.log('OK: t_insumo.estoque_atual migrado para NUMERIC(14,4)')
  client.release(); pool.end()
}).catch(err => { console.error('Erro:', err.message); process.exit(1) })