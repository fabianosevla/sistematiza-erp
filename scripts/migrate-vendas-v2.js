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
  console.log(`\nMigrando vendas v2 no schema: ${SCHEMA}\n`)
  await client.query(`SET search_path TO "${SCHEMA}", public`)

  await client.query(`ALTER TABLE t_venda ADD COLUMN IF NOT EXISTS tipo_entrega VARCHAR(20) NOT NULL DEFAULT 'retirada'`)
  console.log('✓ tipo_entrega adicionado')

  await client.query(`ALTER TABLE t_venda ADD COLUMN IF NOT EXISTS data_entrega TIMESTAMPTZ`)
  console.log('✓ data_entrega adicionado')

  await client.query(`ALTER TABLE t_venda ADD COLUMN IF NOT EXISTS endereco_entrega VARCHAR(300)`)
  console.log('✓ endereco_entrega adicionado')

  await client.query(`ALTER TABLE t_venda ADD COLUMN IF NOT EXISTS observacao_interna VARCHAR(500)`)
  console.log('✓ observacao_interna adicionado')

  await client.query(`ALTER TABLE t_venda ADD COLUMN IF NOT EXISTS vendedor VARCHAR(100)`)
  console.log('✓ vendedor adicionado')

  console.log('\n✅ Migration v2 concluída!\n')
  client.release()
  pool.end()
}).catch(err => {
  console.error('Erro:', err.message)
  process.exit(1)
})