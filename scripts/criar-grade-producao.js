require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')
const pool = new Pool({ host: process.env.DB_HOST, port: 5432, database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD, ssl: { rejectUnauthorized: false } })
pool.connect().then(async client => {
  await client.query('SET search_path TO "tenant_zaghi_massas_caseiras", public')
  await client.query(`
    CREATE TABLE IF NOT EXISTS t_producao_grade (
      grade_id         SERIAL PRIMARY KEY,
      modification_num INTEGER NOT NULL DEFAULT 0,
      created_dt       TIMESTAMP NOT NULL DEFAULT NOW(),
      created_by       INTEGER NOT NULL DEFAULT 1,
      updated_dt       TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_by       INTEGER NOT NULL DEFAULT 1,
      active_flg       BOOLEAN NOT NULL DEFAULT true,
      produto_id       INTEGER NOT NULL REFERENCES t_produto(produto_id),
      data_producao    DATE NOT NULL,
      quantidade       INTEGER NOT NULL DEFAULT 0,
      CONSTRAINT uq_grade_produto_data UNIQUE (produto_id, data_producao)
    )
  `)
  console.log('Tabela t_producao_grade criada!')
  client.release(); pool.end()
}).catch(err => { console.error(err.message); process.exit(1) })