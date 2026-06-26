require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')
const pool = new Pool({ host: process.env.DB_HOST, port: 5432, database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD, ssl: { rejectUnauthorized: false } })
pool.connect().then(async client => {
  await client.query('SET search_path TO "tenant_zaghi_massas_caseiras", public')
  const cols = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 't_producao_grade' ORDER BY ordinal_position")
  console.log('Colunas:', cols.rows)
  const idx = await client.query("SELECT constraint_name FROM information_schema.table_constraints WHERE table_name = 't_producao_grade' AND constraint_type = 'UNIQUE'")
  console.log('Unique constraints:', idx.rows)
  if (idx.rows.length === 0) {
    await client.query('ALTER TABLE t_producao_grade ADD CONSTRAINT uq_grade_produto_data UNIQUE (produto_id, data_producao)')
    console.log('Constraint adicionada!')
  }
  client.release(); pool.end()
}).catch(err => { console.error(err.message); process.exit(1) })