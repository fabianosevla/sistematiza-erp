require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')
const pool = new Pool({ host: process.env.DB_HOST, port: 5432, database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD, ssl: { rejectUnauthorized: false } })
const SCHEMA = 'tenant_zaghi_massas_caseiras'
pool.connect().then(async client => {
  console.log(`\nMigrando Plano de Ação no schema: ${SCHEMA}\n`)
  await client.query(`SET search_path TO "${SCHEMA}", public`)
  await client.query(`
    CREATE TABLE IF NOT EXISTS t_plano_acao (
      acao_id          SERIAL PRIMARY KEY,
      modification_num INTEGER NOT NULL DEFAULT 0,
      created_dt       TIMESTAMPTZ NOT NULL,
      created_by       INTEGER NOT NULL,
      updated_dt       TIMESTAMPTZ NOT NULL,
      updated_by       INTEGER NOT NULL,
      active_flg       BOOLEAN NOT NULL DEFAULT TRUE,
      data_acao        DATE NOT NULL,
      identificacao    VARCHAR(200) NOT NULL,
      acao             TEXT NOT NULL,
      responsavel      VARCHAR(100),
      status           VARCHAR(20) NOT NULL DEFAULT 'pendente',
      concluido_em     TIMESTAMPTZ
    )
  `)
  console.log('✓ t_plano_acao criada')
  console.log('\n✅ Concluída!\n')
  client.release(); pool.end()
}).catch(err => { console.error('Erro:', err.message); process.exit(1) })