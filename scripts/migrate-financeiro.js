require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     5432,
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl:      { rejectUnauthorized: false },
})

const SCHEMA = 'tenant_zaghi_massas_caseiras'

pool.connect().then(async client => {
  console.log(`\nMigrando financeiro no schema: ${SCHEMA}\n`)
  await client.query(`SET search_path TO "${SCHEMA}", public`)

  await client.query(`
    CREATE TABLE IF NOT EXISTS t_despesa (
      despesa_id          SERIAL PRIMARY KEY,
      modification_num    INTEGER NOT NULL DEFAULT 0,
      created_dt          TIMESTAMPTZ NOT NULL,
      created_by          INTEGER NOT NULL,
      updated_dt          TIMESTAMPTZ NOT NULL,
      updated_by          INTEGER NOT NULL,
      active_flg          BOOLEAN NOT NULL DEFAULT TRUE,
      nome                VARCHAR(200) NOT NULL,
      categoria           VARCHAR(100) NOT NULL,
      valor               INTEGER NOT NULL,
      data_despesa        TIMESTAMPTZ NOT NULL,
      recorrente          BOOLEAN NOT NULL DEFAULT FALSE,
      periodo_recorrencia VARCHAR(20),
      observacao          VARCHAR(500)
    )
  `)
  console.log('✓ t_despesa criada')
  console.log('\n✅ Migration financeiro concluída!\n')
  client.release()
  pool.end()
}).catch(err => {
  console.error('Erro:', err.message)
  process.exit(1)
})