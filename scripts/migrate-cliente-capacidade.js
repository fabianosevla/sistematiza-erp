// scripts/migrate-cliente-capacidade.js
//
// Pedido in loco (QA #49). A loja abastece o cliente (mercado, empório) e,
// na visita, conta o que sobrou na prateleira dele. Cada cliente tem uma
// capacidade por produto; o pedido sai como capacidade - estoque no local.
//
//   t_cliente_capacidade (cliente_id, produto_id, capacidade)
//
// Um produto por cliente: UNIQUE (cliente_id, produto_id). Sem a tabela, a
// tela de Pedidos segue funcionando — só o bloco "Pedido in loco" fica vazio.
//
// Idempotente. Rodar: node scripts/migrate-cliente-capacidade.js
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
  console.log(`\nCriando t_cliente_capacidade em ${schemas.length} schema(s)...\n`)

  for (const schema of schemas) {
    try {
      await client.query(`SET search_path TO "${schema}", public`)

      await client.query(`
        CREATE TABLE IF NOT EXISTS t_cliente_capacidade (
          capacidade_id    SERIAL PRIMARY KEY,
          cliente_id       INTEGER NOT NULL,
          produto_id       INTEGER NOT NULL,
          capacidade       INTEGER NOT NULL DEFAULT 0,
          created_by       INTEGER,
          updated_by       INTEGER,
          created_dt       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_dt       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          active_flg       BOOLEAN NOT NULL DEFAULT true,
          modification_num INTEGER NOT NULL DEFAULT 0,
          UNIQUE (cliente_id, produto_id)
        )
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
