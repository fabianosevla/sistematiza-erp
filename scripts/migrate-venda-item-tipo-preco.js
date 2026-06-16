/**
 * Adiciona colunas de rastreabilidade de preço em t_venda_item
 * Rodar: node scripts/migrate-venda-item-tipo-preco.js
 */
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
  console.log(`\nMigrando tipo_precao em t_venda_item — schema: ${SCHEMA}\n`)
  await client.query(`SET search_path TO "${SCHEMA}", public`)

  // Tipo de precificação (varejo | atacado_a | atacado_b | … | atacado_e)
  await client.query(`
    ALTER TABLE t_venda_item
    ADD COLUMN IF NOT EXISTS tipo_precao      VARCHAR(20) NOT NULL DEFAULT 'varejo'
  `)
  console.log('✓ tipo_precao adicionado')

  // Label legível para relatórios ("Atacado A", "Varejo", etc.)
  await client.query(`
    ALTER TABLE t_venda_item
    ADD COLUMN IF NOT EXISTS nome_tipo_precao VARCHAR(30) NOT NULL DEFAULT 'Varejo'
  `)
  console.log('✓ nome_tipo_precao adicionado')

  // Índice para facilitar relatórios por canal de venda
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_venda_item_tipo_precao
    ON t_venda_item (tipo_precao)
  `)
  console.log('✓ Índice idx_venda_item_tipo_precao criado')

  console.log('\n✅ Migration concluída!\n')
  client.release()
  pool.end()
}).catch(err => {
  console.error('Erro:', err.message)
  process.exit(1)
})