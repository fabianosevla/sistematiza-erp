require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')
const pool = new Pool({ host: process.env.DB_HOST, port: 5432, database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD, ssl: { rejectUnauthorized: false } })
const SCHEMA = 'tenant_zaghi_massas_caseiras'
pool.connect().then(async client => {
  console.log(`\nMigrando Compras no schema: ${SCHEMA}\n`)
  await client.query(`SET search_path TO "${SCHEMA}", public`)
  await client.query(`
    CREATE TABLE IF NOT EXISTS t_compra_insumo (
      compra_id        SERIAL PRIMARY KEY,
      modification_num INTEGER NOT NULL DEFAULT 0,
      created_dt       TIMESTAMPTZ NOT NULL,
      created_by       INTEGER NOT NULL,
      updated_dt       TIMESTAMPTZ NOT NULL,
      updated_by       INTEGER NOT NULL,
      active_flg       BOOLEAN NOT NULL DEFAULT TRUE,
      fornecedor_id    INTEGER,
      insumo_id        INTEGER,
      nome_fornecedor  VARCHAR(200),
      nome_insumo      VARCHAR(200) NOT NULL,
      data_entrada     DATE NOT NULL,
      data_pagamento   DATE,
      valor_unitario   INTEGER NOT NULL DEFAULT 0,
      quantidade       NUMERIC(10,3) NOT NULL DEFAULT 0,
      caixas           INTEGER NOT NULL DEFAULT 0,
      qtd_total        NUMERIC(10,3) NOT NULL DEFAULT 0,
      quem_pagou       VARCHAR(100),
      status           VARCHAR(20) NOT NULL DEFAULT 'pendente',
      observacao       VARCHAR(500)
    )
  `)
  console.log('✓ t_compra_insumo criada')
  console.log('\n✅ Concluída!\n')
  client.release(); pool.end()
}).catch(err => { console.error('Erro:', err.message); process.exit(1) })