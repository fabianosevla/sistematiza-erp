// scripts/migrate-cardapio-horario.js
//
// Cardápio Digital — horário de atendimento (QA #102). Um JSON por tenant,
// um bloco por dia da semana ({ aberto, abre, fecha }). Coluna nula = sem
// restrição de horário, comportamento de hoje preservado pra quem não
// configurar nada.
//
//   t_configuracoes_tenant.cardapio_horario  (jsonb, nullable)
//
// Idempotente. Rodar: node scripts/migrate-cardapio-horario.js
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
  console.log(`\nAdicionando cardapio_horario em ${schemas.length} schema(s)...\n`)

  for (const schema of schemas) {
    try {
      await client.query(`SET search_path TO "${schema}", public`)

      await client.query(`
        ALTER TABLE t_configuracoes_tenant
        ADD COLUMN IF NOT EXISTS cardapio_horario JSONB
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
