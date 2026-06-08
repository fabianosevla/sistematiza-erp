require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')
const pool = new Pool({ host: process.env.DB_HOST, port: 5432, database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD, ssl: { rejectUnauthorized: false } })
const SCHEMA = 'tenant_zaghi_massas_caseiras'

pool.connect().then(async client => {
  console.log(`\nMigrando financeiro v2 — periodicidade mensal no schema: ${SCHEMA}\n`)
  await client.query(`SET search_path TO "${SCHEMA}", public`)

  await client.query(`ALTER TABLE t_despesa ADD COLUMN IF NOT EXISTS mes_competencia INTEGER`)
  await client.query(`ALTER TABLE t_despesa ADD COLUMN IF NOT EXISTS ano_competencia INTEGER`)
  await client.query(`ALTER TABLE t_despesa ADD COLUMN IF NOT EXISTS despesa_origem_id INTEGER`)
  await client.query(`ALTER TABLE t_despesa ADD COLUMN IF NOT EXISTS gerada_automaticamente BOOLEAN NOT NULL DEFAULT FALSE`)
  console.log('✓ Colunas de competência mensal adicionadas')

  // Preencher competência das despesas existentes com base na data_despesa
  await client.query(`
    UPDATE t_despesa
    SET mes_competencia = EXTRACT(MONTH FROM data_despesa)::int,
        ano_competencia = EXTRACT(YEAR  FROM data_despesa)::int
    WHERE mes_competencia IS NULL
  `)
  console.log('✓ Competência mensal preenchida nas despesas existentes')

  console.log('\n✅ Migration financeiro v2 concluída!\n')
  client.release(); pool.end()
}).catch(err => { console.error('Erro:', err.message); process.exit(1) })