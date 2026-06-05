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

const SCHEMA = 'tenant_zaghi_massas_caseiras'

pool.connect().then(async client => {
  console.log(`\nMigrando fichas técnicas no schema: ${SCHEMA}\n`)
  await client.query(`SET search_path TO "${SCHEMA}", public`)

  await client.query(`
    CREATE TABLE IF NOT EXISTS t_produto_insumo (
      produto_insumo_id SERIAL PRIMARY KEY,
      modification_num  INTEGER NOT NULL DEFAULT 0,
      created_dt        TIMESTAMPTZ NOT NULL,
      created_by        INTEGER NOT NULL,
      updated_dt        TIMESTAMPTZ NOT NULL,
      updated_by        INTEGER NOT NULL,
      active_flg        BOOLEAN NOT NULL DEFAULT TRUE,
      produto_id        INTEGER NOT NULL,
      insumo_id         INTEGER NOT NULL,
      quantidade        NUMERIC(10,3) NOT NULL,
      unidade           VARCHAR(20) NOT NULL DEFAULT 'kg',
      observacao        VARCHAR(200)
    )
  `)
  console.log('✓ t_produto_insumo criada')

  await client.query(`
    CREATE TABLE IF NOT EXISTS t_cliente_produto (
      cliente_produto_id SERIAL PRIMARY KEY,
      modification_num   INTEGER NOT NULL DEFAULT 0,
      created_dt         TIMESTAMPTZ NOT NULL,
      created_by         INTEGER NOT NULL,
      updated_dt         TIMESTAMPTZ NOT NULL,
      updated_by         INTEGER NOT NULL,
      active_flg         BOOLEAN NOT NULL DEFAULT TRUE,
      cliente_id         INTEGER NOT NULL,
      produto_id         INTEGER NOT NULL,
      quantidade_padrao  INTEGER NOT NULL DEFAULT 0,
      observacao         VARCHAR(200)
    )
  `)
  console.log('✓ t_cliente_produto criada')

  await client.query(`
    CREATE TABLE IF NOT EXISTS t_insumo_fornecedor (
      insumo_fornecedor_id SERIAL PRIMARY KEY,
      modification_num     INTEGER NOT NULL DEFAULT 0,
      created_dt           TIMESTAMPTZ NOT NULL,
      created_by           INTEGER NOT NULL,
      updated_dt           TIMESTAMPTZ NOT NULL,
      updated_by           INTEGER NOT NULL,
      active_flg           BOOLEAN NOT NULL DEFAULT TRUE,
      insumo_id            INTEGER NOT NULL,
      fornecedor_id        INTEGER NOT NULL,
      preco_unitario       INTEGER NOT NULL DEFAULT 0,
      unidade              VARCHAR(20),
      principal            BOOLEAN NOT NULL DEFAULT FALSE,
      observacao           VARCHAR(200)
    )
  `)
  console.log('✓ t_insumo_fornecedor criada')

  await client.query(`
    CREATE TABLE IF NOT EXISTS t_forma_pagamento (
      forma_id         SERIAL PRIMARY KEY,
      modification_num INTEGER NOT NULL DEFAULT 0,
      created_dt       TIMESTAMPTZ NOT NULL,
      created_by       INTEGER NOT NULL,
      updated_dt       TIMESTAMPTZ NOT NULL,
      updated_by       INTEGER NOT NULL,
      active_flg       BOOLEAN NOT NULL DEFAULT TRUE,
      nome             VARCHAR(100) NOT NULL,
      taxa             NUMERIC(5,2) NOT NULL DEFAULT 0,
      observacao       VARCHAR(200)
    )
  `)
  console.log('✓ t_forma_pagamento criada')

  await client.query(`
    CREATE TABLE IF NOT EXISTS t_pedido (
      pedido_id          SERIAL PRIMARY KEY,
      modification_num   INTEGER NOT NULL DEFAULT 0,
      created_dt         TIMESTAMPTZ NOT NULL,
      created_by         INTEGER NOT NULL,
      updated_dt         TIMESTAMPTZ NOT NULL,
      updated_by         INTEGER NOT NULL,
      active_flg         BOOLEAN NOT NULL DEFAULT TRUE,
      cliente_id         INTEGER,
      tipo_venda         VARCHAR(20) NOT NULL DEFAULT 'entrega',
      status             VARCHAR(20) NOT NULL DEFAULT 'pendente',
      data_pedido        TIMESTAMPTZ NOT NULL,
      previsao_producao  TIMESTAMPTZ,
      previsao_entrega   TIMESTAMPTZ,
      valor_entrega      INTEGER NOT NULL DEFAULT 0,
      endereco_entrega   VARCHAR(300),
      observacao         VARCHAR(500),
      venda_id           INTEGER
    )
  `)
  console.log('✓ t_pedido criada')

  await client.query(`
    CREATE TABLE IF NOT EXISTS t_pedido_item (
      item_id          SERIAL PRIMARY KEY,
      modification_num INTEGER NOT NULL DEFAULT 0,
      created_dt       TIMESTAMPTZ NOT NULL,
      created_by       INTEGER NOT NULL,
      updated_dt       TIMESTAMPTZ NOT NULL,
      updated_by       INTEGER NOT NULL,
      active_flg       BOOLEAN NOT NULL DEFAULT TRUE,
      pedido_id        INTEGER NOT NULL,
      produto_id       INTEGER NOT NULL,
      nome_produto     VARCHAR(200) NOT NULL,
      quantidade       INTEGER NOT NULL DEFAULT 1,
      preco_unitario   INTEGER NOT NULL DEFAULT 0,
      subtotal         INTEGER NOT NULL DEFAULT 0
    )
  `)
  console.log('✓ t_pedido_item criada')

  await client.query(`
    CREATE TABLE IF NOT EXISTS t_producao_semanal (
      producao_id      SERIAL PRIMARY KEY,
      modification_num INTEGER NOT NULL DEFAULT 0,
      created_dt       TIMESTAMPTZ NOT NULL,
      created_by       INTEGER NOT NULL,
      updated_dt       TIMESTAMPTZ NOT NULL,
      updated_by       INTEGER NOT NULL,
      active_flg       BOOLEAN NOT NULL DEFAULT TRUE,
      produto_id       INTEGER NOT NULL,
      data_producao    DATE NOT NULL,
      quantidade       INTEGER NOT NULL DEFAULT 0,
      status           VARCHAR(20) NOT NULL DEFAULT 'planejado',
      observacao       VARCHAR(200)
    )
  `)
  console.log('✓ t_producao_semanal criada')

  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_producao_produto_data
    ON t_producao_semanal (produto_id, data_producao)
    WHERE active_flg = true
  `)
  console.log('✓ Índice único produto+data criado')

  await client.query(`
    INSERT INTO t_forma_pagamento (nome, taxa, created_dt, updated_dt, created_by, updated_by)
    VALUES
      ('Dinheiro', 0, NOW(), NOW(), 1, 1),
      ('PIX', 0, NOW(), NOW(), 1, 1),
      ('Cartão Crédito', 2.99, NOW(), NOW(), 1, 1),
      ('Cartão Débito', 1.49, NOW(), NOW(), 1, 1),
      ('Vale Refeição', 0, NOW(), NOW(), 1, 1),
      ('Cheque', 0, NOW(), NOW(), 1, 1),
      ('Boleto', 0, NOW(), NOW(), 1, 1)
    ON CONFLICT DO NOTHING
  `)
  console.log('✓ Formas de pagamento padrão inseridas')

  console.log('\n✅ Migration fichas concluída!\n')
  client.release()
  pool.end()
}).catch(err => {
  console.error('Erro:', err.message)
  process.exit(1)
})