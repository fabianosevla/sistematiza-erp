/**
 * Migration: dados de imposto no XML de entrada (compra)
 *
 * O leitor de XML de entrada (EntradaNfeService) pegava fornecedor, itens,
 * quantidade e valor — e jogava fora a parte de imposto do XML (CFOP,
 * CST/CSOSN, ICMS, ICMS-ST). Essa é justamente a informação que diz se o
 * fornecedor já reteve a substituição tributária daquele produto ou não —
 * sem ela, quem revende não sabe qual CSOSN usar na venda seguinte (foi
 * exatamente a dúvida do vinho: sem essa informação, a hipótese do CFOP era
 * só chute).
 *
 * Idempotente: usa IF NOT EXISTS, pode rodar quantas vezes precisar.
 *
 * Rodar: node scripts/migrate-entrada-nfe-impostos.js
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

async function migrarSchema(client, schema) {
  await client.query(`SET search_path TO "${schema}", public`)

  await client.query(`ALTER TABLE t_entrada_nfe_item ADD COLUMN IF NOT EXISTS cfop           VARCHAR(4)`)
  await client.query(`ALTER TABLE t_entrada_nfe_item ADD COLUMN IF NOT EXISTS cst_csosn      VARCHAR(10)`)
  await client.query(`ALTER TABLE t_entrada_nfe_item ADD COLUMN IF NOT EXISTS valor_icms     INTEGER NOT NULL DEFAULT 0`)
  await client.query(`ALTER TABLE t_entrada_nfe_item ADD COLUMN IF NOT EXISTS valor_bc_st    INTEGER NOT NULL DEFAULT 0`)
  await client.query(`ALTER TABLE t_entrada_nfe_item ADD COLUMN IF NOT EXISTS valor_icms_st  INTEGER NOT NULL DEFAULT 0`)
}

pool.connect().then(async client => {
  const res = await client.query(`
    SELECT schema_name FROM information_schema.schemata
    WHERE schema_name LIKE 'tenant_%'
    ORDER BY schema_name
  `)
  const schemas = res.rows.map(r => r.schema_name)
  console.log(`\nEntrada NFe — impostos: migrando ${schemas.length} schema(s) de tenant...\n`)

  for (const schema of schemas) {
    try {
      await migrarSchema(client, schema)
      console.log(`  ✓ ${schema}`)
    } catch (e) {
      console.error(`  ✗ ${schema}: ${e.message}`)
    }
  }

  console.log('\n✅ Migration concluída!\n')
  client.release()
  pool.end()
}).catch(err => { console.error('Erro:', err.message); process.exit(1) })
