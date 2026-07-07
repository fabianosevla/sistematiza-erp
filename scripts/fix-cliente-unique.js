require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')
const pool = new Pool({ host: process.env.DB_HOST, port: 5432, database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD, ssl: { rejectUnauthorized: false } })
pool.connect().then(async client => {
  await client.query('SET search_path TO "tenant_zaghi_massas_caseiras", public')
  try {
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_cliente_documento ON t_cliente (LOWER(documento)) WHERE active_flg = true AND documento IS NOT NULL AND documento != ''`)
    console.log('OK: uq_cliente_documento')
  } catch(e) { console.log('ERRO:', e.message) }
  client.release(); pool.end()
}).catch(err => { console.error(err.message); process.exit(1) })