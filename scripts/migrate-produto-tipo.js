require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')
const pool = new Pool({ host: process.env.DB_HOST, port: 5432, database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD, ssl: { rejectUnauthorized: false } })
const SCHEMA = 'tenant_zaghi_massas_caseiras'

pool.connect().then(async client => {
  console.log(`\nCorrigindo coluna tipo em t_produto — schema: ${SCHEMA}\n`)
  await client.query(`SET search_path TO "${SCHEMA}", public`)
  await client.query(`ALTER TABLE t_produto ADD COLUMN IF NOT EXISTS tipo VARCHAR(100)`)
  console.log('✓ Coluna tipo confirmada em t_produto (idempotente)')
  console.log('\n✅ Concluído!\n')
  client.release(); pool.end()
}).catch(err => { console.error('Erro:', err.message); process.exit(1) }) 