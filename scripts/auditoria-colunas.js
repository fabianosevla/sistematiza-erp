require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')
const pool = new Pool({ host: process.env.DB_HOST, port: 5432, database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD, ssl: { rejectUnauthorized: false } })
const SCHEMA = 'tenant_zaghi_massas_caseiras'
const TABELAS = ['t_produto','t_insumo','t_produto_insumo','t_venda','t_venda_item','t_cliente','t_fornecedor','t_usuario']

pool.connect().then(async client => {
  await client.query(`SET search_path TO "${SCHEMA}", public`)
  for (const tabela of TABELAS) {
    const r = await client.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position`, [tabela])
    console.log(`\n=== ${tabela} ===`)
    r.rows.forEach(c => console.log(`  ${c.column_name} (${c.data_type})`))
  }
  client.release(); pool.end()
}).catch(err => { console.error('Erro:', err.message); process.exit(1) })