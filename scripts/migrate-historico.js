require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

const pool = new Pool({
  host: process.env.DB_HOST, port: 5432,
  database: process.env.DB_NAME, user: process.env.DB_USER,
  password: process.env.DB_PASSWORD, ssl: { rejectUnauthorized: false },
})

const SCHEMA = 'tenant_zaghi_massas_caseiras'

pool.connect().then(async client => {
  console.log(`\nMigrando Histórico no schema: ${SCHEMA}\n`)
  await client.query(`SET search_path TO "${SCHEMA}", public`)

  await client.query(`
    CREATE TABLE IF NOT EXISTS t_historico (
      historico_id   SERIAL PRIMARY KEY,
      created_dt     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by     INTEGER NOT NULL DEFAULT 1,
      entidade       VARCHAR(50) NOT NULL,
      entidade_id    INTEGER NOT NULL,
      acao           VARCHAR(20) NOT NULL,
      campo          VARCHAR(100),
      valor_anterior TEXT,
      valor_novo     TEXT,
      descricao      TEXT
    )
  `)

  console.log('✓ t_historico criada')
  console.log('\n✅ Concluído!\n')
  client.release()
  pool.end()
}).catch(err => { console.error('Erro:', err.message); process.exit(1) })