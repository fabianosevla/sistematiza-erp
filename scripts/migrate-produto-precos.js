require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')
const pool = new Pool({ host: process.env.DB_HOST, port: 5432, database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD, ssl: { rejectUnauthorized: false } })
const SCHEMA = 'tenant_zaghi_massas_caseiras'

pool.connect().then(async client => {
  console.log(`\nMigrando preços atacado A-E no schema: ${SCHEMA}\n`)
  await client.query(`SET search_path TO "${SCHEMA}", public`)
  await client.query(`ALTER TABLE t_produto ADD COLUMN IF NOT EXISTS preco_atacado_a INTEGER NOT NULL DEFAULT 0`)
  await client.query(`ALTER TABLE t_produto ADD COLUMN IF NOT EXISTS preco_atacado_b INTEGER NOT NULL DEFAULT 0`)
  await client.query(`ALTER TABLE t_produto ADD COLUMN IF NOT EXISTS preco_atacado_c INTEGER NOT NULL DEFAULT 0`)
  await client.query(`ALTER TABLE t_produto ADD COLUMN IF NOT EXISTS preco_atacado_d INTEGER NOT NULL DEFAULT 0`)
  await client.query(`ALTER TABLE t_produto ADD COLUMN IF NOT EXISTS preco_atacado_e INTEGER NOT NULL DEFAULT 0`)
  // Copia preço atacado existente para A
  await client.query(`UPDATE t_produto SET preco_atacado_a = preco_atacado WHERE preco_atacado_a = 0 AND preco_atacado > 0`)
  console.log('✓ Colunas preco_atacado_a até _e adicionadas')
  console.log('✓ preco_atacado copiado para preco_atacado_a')
  console.log('\n✅ Concluído!\n')
  client.release(); pool.end()
}).catch(err => { console.error('Erro:', err.message); process.exit(1) })