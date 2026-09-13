/**
 * Migration: t_venda.origem_cardapio (13/09/2026)
 *
 * O PDV vende direto (sem passar por t_pedido), então não tinha como marcar
 * "isso veio do cardápio digital" numa venda de balcão — só o Pedido tinha
 * esse campo (t_pedido.origem). Esta coluna traz a mesma marcação pro lado
 * do PDV, e alimenta o mesmo funil do CRM (Cardápio Digital → visualizações
 * → pedidos montados → vendas confirmadas). Ver CardapioAnaliticaService.
 *
 * Idempotente: usa IF NOT EXISTS, pode rodar quantas vezes precisar.
 *
 * Rodar: node scripts/migrate-venda-origem-cardapio.js
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
  await client.query(`ALTER TABLE t_venda ADD COLUMN IF NOT EXISTS origem_cardapio BOOLEAN NOT NULL DEFAULT FALSE`)
}

pool.connect().then(async client => {
  const res = await client.query(`
    SELECT schema_name FROM information_schema.schemata
    WHERE schema_name LIKE 'tenant_%'
    ORDER BY schema_name
  `)
  const schemas = res.rows.map(r => r.schema_name)
  console.log(`\nt_venda.origem_cardapio: migrando ${schemas.length} schema(s) de tenant...\n`)

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
