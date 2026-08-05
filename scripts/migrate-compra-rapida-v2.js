// scripts/migrate-compra-rapida-v2.js
//
// COMPRA RÁPIDA — CABEÇALHO + ITENS.
//
// Hoje t_compra_insumo guarda UMA LINHA POR ITEM: cada registro tem
// insumo_id, valor_unitario e quantidade. Uma nota do mercado com 8 insumos
// vira 8 compras separadas — e, como o ComprasService lança uma despesa por
// compra, vira também 8 despesas para a mesma nota.
//
// Esta migration cria a estrutura correta:
//
//   t_compra       cabeçalho: fornecedor, documento, pagamento, vencimento
//   t_compra_item  itens: insumo, quantidade, valor unitário, subtotal
//
// t_compra_insumo NÃO é apagada nem alterada. As compras antigas continuam lá
// e seguem visíveis no histórico — migrar dado de produção sem necessidade é
// risco sem ganho.
//
// IDEMPOTENTE: pode rodar mais de uma vez sem estragar nada.
//
//   node scripts/migrate-compra-rapida-v2.js            (simula)
//   node scripts/migrate-compra-rapida-v2.js --aplicar  (executa)
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

const APLICAR = process.argv.includes('--aplicar')

function conexao() {
  if (process.env.DATABASE_URL) return { connectionString: process.env.DATABASE_URL }
  const host = process.env.DB_HOST
  if (!host) throw new Error('Defina DATABASE_URL ou DB_HOST/... no .env.local')
  const local = /^(localhost|127\.0\.0\.1)$/.test(host)
  return {
    host,
    port:     Number(process.env.DB_PORT ?? 5432),
    database: process.env.DB_NAME,
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl:      local ? false : { rejectUnauthorized: false },
  }
}

const DDL = [
  // ── CABEÇALHO ────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS t_compra (
     compra_id        SERIAL PRIMARY KEY,
     modification_num INTEGER NOT NULL DEFAULT 0,
     created_dt       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     created_by       INTEGER NOT NULL DEFAULT 1,
     updated_dt       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_by       INTEGER NOT NULL DEFAULT 1,
     active_flg       BOOLEAN NOT NULL DEFAULT TRUE,

     fornecedor_id    INTEGER,
     nome_fornecedor  VARCHAR(200),
     data_compra      DATE NOT NULL,
     documento        VARCHAR(60),

     -- 'a_vista' ou 'a_prazo'. À vista vira despesa na data da compra;
     -- a prazo vira conta a pagar com vencimento, e só vira despesa quando
     -- for baixada.
     condicao         VARCHAR(20) NOT NULL DEFAULT 'a_vista',
     forma_pagamento  VARCHAR(60),
     data_vencimento  DATE,

     valor_total      INTEGER NOT NULL DEFAULT 0,
     status           VARCHAR(20) NOT NULL DEFAULT 'registrada',

     -- Rastro do que a compra gerou no financeiro. Sem estes vínculos não há
     -- como estornar uma compra sem deixar despesa órfã no caixa.
     despesa_id       INTEGER,
     conta_pagar_id   INTEGER,

     observacao       VARCHAR(500)
   )`,

  // ── ITENS ────────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS t_compra_item (
     item_id          SERIAL PRIMARY KEY,
     modification_num INTEGER NOT NULL DEFAULT 0,
     created_dt       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     created_by       INTEGER NOT NULL DEFAULT 1,
     updated_dt       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_by       INTEGER NOT NULL DEFAULT 1,
     active_flg       BOOLEAN NOT NULL DEFAULT TRUE,

     compra_id        INTEGER NOT NULL,
     insumo_id        INTEGER,
     nome_insumo      VARCHAR(200) NOT NULL,
     unidade          VARCHAR(20),

     -- NUMERIC(12,3) igual ao estoque: insumo se compra em fração.
     quantidade       NUMERIC(12,3) NOT NULL DEFAULT 0,
     valor_unitario   INTEGER NOT NULL DEFAULT 0,
     subtotal         INTEGER NOT NULL DEFAULT 0
   )`,

  `CREATE INDEX IF NOT EXISTS ix_compra_item_compra ON t_compra_item (compra_id)`,
  `CREATE INDEX IF NOT EXISTS ix_compra_data        ON t_compra (data_compra)`,
  `CREATE INDEX IF NOT EXISTS ix_compra_fornecedor  ON t_compra (fornecedor_id)`,
]

async function main() {
  const pool = new Pool(conexao())
  const c    = await pool.connect()

  try {
    const { rows: schemas } = await c.query(`
      SELECT schema_name FROM information_schema.schemata
      WHERE schema_name LIKE 'tenant\\_%' ESCAPE '\\' ORDER BY schema_name
    `)

    console.log(APLICAR ? '\n>>> MODO GRAVACAO\n' : '\n>>> SIMULACAO — nada sera criado. Use --aplicar.\n')

    for (const { schema_name: schema } of schemas) {
      console.log(`\n── ${schema}`)
      await c.query(`SET search_path TO "${schema}", public`)

      const { rows } = await c.query(`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = $1 AND table_name IN ('t_compra', 't_compra_item', 't_compra_insumo')
      `, [schema])
      const existentes = new Set(rows.map(r => r.table_name))

      console.log(`   t_compra_insumo (historico): ${existentes.has('t_compra_insumo') ? 'existe, sera preservada' : 'nao existe'}`)
      console.log(`   t_compra:                    ${existentes.has('t_compra') ? 'JA EXISTE' : 'sera criada'}`)
      console.log(`   t_compra_item:               ${existentes.has('t_compra_item') ? 'JA EXISTE' : 'sera criada'}`)

      if (!APLICAR) continue

      await c.query('BEGIN')
      try {
        for (const ddl of DDL) await c.query(ddl)
        await c.query('COMMIT')
        console.log('   OK')
      } catch (e) {
        await c.query('ROLLBACK')
        console.log(`   ERRO: ${e.message}`)
        throw e
      }
    }

    if (!APLICAR) console.log('\nSimulacao encerrada. Rode com --aplicar para criar.')
  } finally {
    c.release()
    await pool.end()
  }
}

main().catch(err => { console.error('\nERRO:', err.message); process.exit(1) })
