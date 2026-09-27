// scripts/migrate-compra-tipo.js
//
// Compras de insumos e Compras de despesas no mesmo formulario (QA #123,
// padronizacao). A despesa passa a ser uma compra como outra qualquer —
// fornecedor, documento, quantidade, valor unitario, a vista/a prazo — so
// que nao entra no estoque e leva uma categoria.
//
//   t_compra.tipo       'insumo' | 'despesa'  (default 'insumo': o que ja
//                       existe continua sendo compra de insumo)
//   t_compra.categoria  categoria da despesa (Aluguel, Embalagens, ...)
//
// RODAR ANTES DO DEPLOY: o codigo novo filtra Compras por t_compra.tipo.
//
// Idempotente. Rodar: node scripts/migrate-compra-tipo.js
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
  console.log(`\nAdicionando t_compra.tipo e t_compra.categoria em ${schemas.length} schema(s)...\n`)

  for (const schema of schemas) {
    try {
      await client.query(`SET search_path TO "${schema}", public`)
      const tem = await client.query(`SELECT to_regclass('t_compra') IS NOT NULL AS ok`)
      if (!tem.rows[0].ok) { console.log(`  ${schema}: sem t_compra, pulando`); continue }
      await client.query(`ALTER TABLE t_compra ADD COLUMN IF NOT EXISTS tipo VARCHAR(10) NOT NULL DEFAULT 'insumo'`)
      await client.query(`ALTER TABLE t_compra ADD COLUMN IF NOT EXISTS categoria VARCHAR(60)`)
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
