/**
 * Migration: Indique e ganhe (módulo Fidelidade)
 *
 * - t_fidelidade_config: indicacao_ativa (liga/desliga) + indicacao_pct_bp
 *   (percentual da primeira compra do indicado, em basis points).
 * - t_cliente: indicado_por_cliente_id, aponta pra quem trouxe o cliente.
 *
 * A recompensa usa o mesmo t_fidelidade_movimento e o mesmo tipo 'credito'
 * do cashback normal — não precisa de tabela nova. Isso também faz o
 * estorno existente (CashbackService.estornarVenda) funcionar sozinho: se a
 * venda que disparou o bônus for cancelada, o bônus dos dois lados é
 * revertido junto, porque ambos os créditos levam o venda_id da compra.
 *
 * Idempotente: usa IF NOT EXISTS, pode rodar quantas vezes precisar.
 *
 * Rodar: node scripts/migrate-fidelidade-indicacao.js
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

  await client.query(`
    ALTER TABLE t_fidelidade_config
      ADD COLUMN IF NOT EXISTS indicacao_ativa  BOOLEAN NOT NULL DEFAULT FALSE
  `)
  await client.query(`
    ALTER TABLE t_fidelidade_config
      ADD COLUMN IF NOT EXISTS indicacao_pct_bp INTEGER NOT NULL DEFAULT 500
  `)

  await client.query(`
    ALTER TABLE t_cliente
      ADD COLUMN IF NOT EXISTS indicado_por_cliente_id INTEGER REFERENCES t_cliente(cliente_id)
  `)
}

pool.connect().then(async client => {
  const res = await client.query(`
    SELECT schema_name FROM information_schema.schemata
    WHERE schema_name LIKE 'tenant_%'
    ORDER BY schema_name
  `)
  const schemas = res.rows.map(r => r.schema_name)
  console.log(`\nIndique e ganhe: migrando ${schemas.length} schema(s) de tenant...\n`)

  for (const schema of schemas) {
    try {
      await migrarSchema(client, schema)
      console.log(`  ✓ ${schema}`)
    } catch (e) {
      console.error(`  ✗ ${schema}: ${e.message}`)
    }
  }

  console.log('\n✅ Migration de indique-e-ganhe concluída!\n')
  client.release()
  pool.end()
}).catch(err => { console.error('Erro:', err.message); process.exit(1) })
