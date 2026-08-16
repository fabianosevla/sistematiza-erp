// scripts/migrate-cardapio-layout-visual.js
//
// Cardápio Digital ganha 4 layouts visuais escolhíveis (Clássico, Grade,
// Capa, Compacto) e foto de fundo/capa. Colunas novas:
//
//   t_configuracoes_tenant.cardapio_layout      VARCHAR(20) default 'classico'
//   t_configuracoes_tenant.cardapio_banner_url  VARCHAR(500)
//
// Idempotente. Rodar: node scripts/migrate-cardapio-layout-visual.js
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

const pool = new Pool({
  host: process.env.DB_HOST, port: 5432,
  database: process.env.DB_NAME, user: process.env.DB_USER,
  password: process.env.DB_PASSWORD, ssl: { rejectUnauthorized: false },
})

pool.connect().then(async client => {
  const res = await client.query(`
    SELECT schema_name FROM information_schema.schemata
    WHERE schema_name LIKE 'tenant_%' ORDER BY schema_name
  `)
  const schemas = res.rows.map(r => r.schema_name)
  console.log(`\nAdicionando colunas de layout visual do cardápio em ${schemas.length} schema(s)...\n`)

  for (const schema of schemas) {
    try {
      await client.query(`SET search_path TO "${schema}", public`)

      await client.query(`
        ALTER TABLE t_configuracoes_tenant
        ADD COLUMN IF NOT EXISTS cardapio_layout VARCHAR(20) NOT NULL DEFAULT 'classico',
        ADD COLUMN IF NOT EXISTS cardapio_banner_url VARCHAR(500)
      `)

      console.log(`  ${schema}: ok`)
    } catch (err) {
      console.error(`  ${schema}: ERRO — ${err.message}`)
    }
  }

  console.log('\nConcluído. Lembre de rodar:')
  console.log('   node scripts/criar-schema-modelo.js --aplicar\n')
  client.release()
  pool.end()
}).catch(err => {
  console.error('Falha ao conectar:', err.message)
  process.exit(1)
})
