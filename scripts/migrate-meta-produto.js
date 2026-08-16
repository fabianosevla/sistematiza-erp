require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

const pool = new Pool({
  host: process.env.DB_HOST, port: 5432,
  database: process.env.DB_NAME, user: process.env.DB_USER,
  password: process.env.DB_PASSWORD, ssl: { rejectUnauthorized: false },
})

const SCHEMA = 'tenant_zaghi_massas_caseiras'

pool.connect().then(async client => {
  console.log(`\nMigrando Meta por Produto no schema: ${SCHEMA}\n`)
  await client.query(`SET search_path TO "${SCHEMA}", public`)

  await client.query(`
    CREATE TABLE IF NOT EXISTS t_meta_produto (
      meta_produto_id   SERIAL PRIMARY KEY,
      modification_num  INTEGER NOT NULL DEFAULT 0,
      created_dt        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by        INTEGER NOT NULL DEFAULT 1,
      updated_dt        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by        INTEGER NOT NULL DEFAULT 1,
      active_flg        BOOLEAN NOT NULL DEFAULT TRUE,
      mes               INTEGER NOT NULL,
      ano               INTEGER NOT NULL,
      produto_id        INTEGER NOT NULL,
      quantidade_meta   INTEGER NOT NULL DEFAULT 0,
      UNIQUE(mes, ano, produto_id)
    )
  `)

  console.log('✓ t_meta_produto criada')
  console.log('\n✅ Concluído! Lembre de rodar:')
  console.log('   node scripts/criar-schema-modelo.js --aplicar')
  console.log('   (resincroniza o tenant_modelo com a estrutura nova)\n')
  client.release()
  pool.end()
}).catch(err => { console.error('Erro:', err.message); process.exit(1) })
