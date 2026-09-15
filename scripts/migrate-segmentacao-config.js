/**
 * Migration: limiares de dias da Segmentação viram configuráveis (15/09/2026)
 *
 * SegmentacaoService.resumo() classificava cliente em balde (novo/ativo/
 * em_risco/sumindo/inativo) com limiares de dias FIXOS no código (30/60/120).
 * O Fabiano pediu pra virar configurável por tenant. Estas 3 colunas guardam
 * o que antes era a constante LIMITES do serviço — os defaults abaixo são
 * EXATAMENTE os mesmos valores fixos de antes, pra ninguém ter o
 * comportamento mudado só por essa migração existir.
 *
 * Idempotente: usa IF NOT EXISTS, pode rodar quantas vezes precisar.
 *
 * Rodar: node scripts/migrate-segmentacao-config.js
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
  await client.query(`ALTER TABLE t_configuracoes_tenant ADD COLUMN IF NOT EXISTS segmentacao_dias_ativo INTEGER NOT NULL DEFAULT 30`)
  await client.query(`ALTER TABLE t_configuracoes_tenant ADD COLUMN IF NOT EXISTS segmentacao_dias_em_risco INTEGER NOT NULL DEFAULT 60`)
  await client.query(`ALTER TABLE t_configuracoes_tenant ADD COLUMN IF NOT EXISTS segmentacao_dias_sumindo INTEGER NOT NULL DEFAULT 120`)
}

pool.connect().then(async client => {
  const res = await client.query(`
    SELECT schema_name FROM information_schema.schemata
    WHERE schema_name LIKE 'tenant_%'
    ORDER BY schema_name
  `)
  const schemas = res.rows.map(r => r.schema_name)
  console.log(`\nSegmentação: migrando ${schemas.length} schema(s) de tenant...\n`)

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
