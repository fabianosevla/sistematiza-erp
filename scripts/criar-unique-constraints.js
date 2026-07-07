require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')
const pool = new Pool({ host: process.env.DB_HOST, port: 5432, database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD, ssl: { rejectUnauthorized: false } })
pool.connect().then(async client => {
  await client.query('SET search_path TO "tenant_zaghi_massas_caseiras", public')
  const constraints = [
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_insumo_nome ON t_insumo (LOWER(nome)) WHERE active_flg = true`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_cliente_cnpj ON t_cliente (LOWER(cnpj_cpf)) WHERE active_flg = true AND cnpj_cpf IS NOT NULL AND cnpj_cpf != ''`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_fornecedor_cnpj ON t_fornecedor (LOWER(cnpj_cpf)) WHERE active_flg = true AND cnpj_cpf IS NOT NULL AND cnpj_cpf != ''`,
  ]
  for (const sql of constraints) {
    try {
      await client.query(sql)
      console.log('OK:', sql.match(/uq_\w+/)?.[0])
    } catch(e) { console.log('ERRO:', e.message) }
  }
  client.release(); pool.end()
}).catch(err => { console.error(err.message); process.exit(1) })