/**
 * Migration: CFOP deixa de ser digitado à mão — passa a ser CALCULADO
 *
 * Até aqui, cfop_interno/cfop_interestadual eram texto livre no perfil
 * tributário. Nada impedia marcar "tem ST" e deixar o CFOP da família sem
 * ST (ou o contrário) — os dois campos não se falavam.
 *
 * Agora o perfil ganha `origem_mercadoria` (produção própria | revenda).
 * Com isso preenchido, o CFOP passa a ser calculado a partir de
 * (origem × tem ST × mesmo estado ou não) — olhe lib/fiscal/cfopVenda.ts.
 * Perfil sem origem_mercadoria preenchida continua no comportamento antigo
 * (CFOP fixo, digitado), pra não quebrar o que já está parametrizado.
 *
 * `t_icms_st_uf` ganha `tem_st` (nullable): permite dizer que UM ESTADO
 * específico não tem (ou tem) ST pra aquele perfil, mesmo que o perfil como
 * um todo diga o contrário — porque o protocolo de ST é por estado, nem
 * todo estado aderiu ao mesmo.
 *
 * Idempotente.
 *
 * Rodar: node scripts/migrate-origem-mercadoria-st-por-estado.js
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
  await client.query(`ALTER TABLE t_perfil_tributario ADD COLUMN IF NOT EXISTS origem_mercadoria VARCHAR(20)`)
  await client.query(`ALTER TABLE t_icms_st_uf ADD COLUMN IF NOT EXISTS tem_st BOOLEAN`)
}

pool.connect().then(async client => {
  const res = await client.query(`
    SELECT schema_name FROM information_schema.schemata
    WHERE schema_name LIKE 'tenant_%'
    ORDER BY schema_name
  `)
  const schemas = res.rows.map(r => r.schema_name)
  console.log(`\nOrigem da mercadoria + ST por estado: migrando ${schemas.length} schema(s)...\n`)
  for (const schema of schemas) {
    try { await migrarSchema(client, schema); console.log(`  ✓ ${schema}`) }
    catch (e) { console.error(`  ✗ ${schema}: ${e.message}`) }
  }
  console.log('\n✅ Migration concluída!\n')
  client.release()
  pool.end()
}).catch(err => { console.error('Erro:', err.message); process.exit(1) })
