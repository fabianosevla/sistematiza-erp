require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')
const pool = new Pool({ host: process.env.DB_HOST, port: 5432, database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD, ssl: { rejectUnauthorized: false } })
pool.connect().then(async client => {
  await client.query('SET search_path TO "tenant_zaghi_massas_caseiras", public')
  const r = await client.query('SELECT venda_id, total, vendida_em FROM t_venda ORDER BY vendida_em DESC LIMIT 5')
  console.log('Ultimas vendas:', r.rows)
  client.release(); pool.end()
}).catch(err => { console.error(err.message); process.exit(1) })