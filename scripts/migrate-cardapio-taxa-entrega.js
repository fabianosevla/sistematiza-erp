// scripts/migrate-cardapio-taxa-entrega.js
//
// Cardápio Digital — taxa de entrega (QA #101). Valor fixo, em centavos,
// configurado pela empresa em Cardápio Digital → layout, somado
// automaticamente ao pedido quando o cliente escolhe "Entrega".
//
//   t_configuracoes_tenant.cardapio_taxa_entrega  (centavos, default 0)
//
// Idempotente. Rodar: node scripts/migrate-cardapio-taxa-entrega.js
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
  console.log(`\nAdicionando cardapio_taxa_entrega em ${schemas.length} schema(s)...\n`)

  for (const schema of schemas) {
    try {
      await client.query(`SET search_path TO "${schema}", public`)

      await client.query(`
        ALTER TABLE t_configuracoes_tenant
        ADD COLUMN IF NOT EXISTS cardapio_taxa_entrega INTEGER NOT NULL DEFAULT 0
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
