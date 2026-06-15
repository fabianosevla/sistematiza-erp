require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

const pool = new Pool({
  host: process.env.DB_HOST, port: 5432,
  database: process.env.DB_NAME, user: process.env.DB_USER,
  password: process.env.DB_PASSWORD, ssl: { rejectUnauthorized: false },
})

const SCHEMA = 'tenant_zaghi_massas_caseiras'

pool.connect().then(async client => {
  await client.query(`SET search_path TO "${SCHEMA}", public`)
  await client.query(`
    CREATE TABLE IF NOT EXISTS t_filtro_salvo (
      filtro_id   SERIAL PRIMARY KEY,
      created_dt  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_dt  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      active_flg  BOOLEAN NOT NULL DEFAULT TRUE,
      modulo      VARCHAR(50) NOT NULL,
      nome        VARCHAR(100) NOT NULL,
      filtros     JSONB NOT NULL DEFAULT '{}'
    )
  `)
  console.log('✓ t_filtro_salvo criada')
  console.log('\n✅ Concluído!\n')
  client.release(); pool.end()
}).catch(err => { console.error(err.message); process.exit(1) })