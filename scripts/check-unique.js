require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')
const pool = new Pool({ host: process.env.DB_HOST, port: 5432, database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD, ssl: { rejectUnauthorized: false } })
pool.connect().then(async client => {
  await client.query('SET search_path TO "tenant_zaghi_massas_caseiras", public')
  const r = await client.query(`
    SELECT tc.table_name, tc.constraint_name, tc.constraint_type, kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    WHERE tc.constraint_type = 'UNIQUE'
    AND tc.table_name IN ('t_produto','t_insumo','t_cliente','t_fornecedor')
    ORDER BY tc.table_name
  `)
  console.log('Constraints UNIQUE:', r.rows)
  client.release(); pool.end()
}).catch(err => { console.error(err.message); process.exit(1) })