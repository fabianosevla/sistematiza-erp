/**
 * Migration: CSOSN "sem ST" — par do CSOSN "com ST" que o perfil já tinha
 *
 * DANFEs reais mostraram: quando a venda cai fora do estado (sem ST, porque
 * o protocolo de substituição tributária normalmente só vale dentro do
 * estado), o CSOSN também muda — não é só o CFOP. Perfil com ST usa 201;
 * a mesma venda sem ST usa 102, não é "sem preencher".
 *
 * Idempotente.
 * Rodar: node scripts/migrate-csosn-sem-st.js
 */
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')
const pool = new Pool({
  host: process.env.DB_HOST, port: 5432, database: process.env.DB_NAME,
  user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
})
async function migrarSchema(client, schema) {
  await client.query(`SET search_path TO "${schema}", public`)
  await client.query(`ALTER TABLE t_perfil_tributario ADD COLUMN IF NOT EXISTS csosn_sem_st VARCHAR(4)`)
  await client.query(`ALTER TABLE t_perfil_tributario ADD COLUMN IF NOT EXISTS cst_sem_st    VARCHAR(3)`)
}
pool.connect().then(async client => {
  const res = await client.query(`SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'tenant_%' ORDER BY schema_name`)
  const schemas = res.rows.map(r => r.schema_name)
  console.log(`\nCSOSN sem ST: migrando ${schemas.length} schema(s)...\n`)
  for (const schema of schemas) {
    try { await migrarSchema(client, schema); console.log(`  ✓ ${schema}`) }
    catch (e) { console.error(`  ✗ ${schema}: ${e.message}`) }
  }
  console.log('\n✅ Concluída!\n')
  client.release(); pool.end()
}).catch(err => { console.error('Erro:', err.message); process.exit(1) })
