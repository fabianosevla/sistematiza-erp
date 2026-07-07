require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')
const pool = new Pool({ host: process.env.DB_HOST, port: 5432, database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD, ssl: { rejectUnauthorized: false } })
pool.connect().then(async client => {
  await client.query('SET search_path TO "tenant_zaghi_massas_caseiras", public')
  
  // Duplicados em insumos
  const dup = await client.query(`SELECT LOWER(nome) as nome, COUNT(*) FROM t_insumo WHERE active_flg=true GROUP BY LOWER(nome) HAVING COUNT(*) > 1`)
  console.log('Insumos duplicados:', dup.rows)
  
  // Colunas de cliente
  const cols_c = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_name='t_cliente' AND column_name LIKE '%cpf%' OR column_name LIKE '%cnpj%' OR column_name LIKE '%documento%'`)
  console.log('Colunas CPF cliente:', cols_c.rows)
  
  // Colunas de fornecedor
  const cols_f = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_name='t_fornecedor' AND (column_name LIKE '%cpf%' OR column_name LIKE '%cnpj%' OR column_name LIKE '%documento%')`)
  console.log('Colunas CPF fornecedor:', cols_f.rows)
  
  client.release(); pool.end()
}).catch(err => { console.error(err.message); process.exit(1) })