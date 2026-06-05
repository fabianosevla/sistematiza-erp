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
  console.log(`\nMigrando vendas e comandas no schema: ${SCHEMA}\n`)
  await client.query(`SET search_path TO "${SCHEMA}", public`)

  await client.query(`
    CREATE TABLE IF NOT EXISTS t_configuracoes_tenant (
      config_id        SERIAL PRIMARY KEY,
      modification_num INTEGER NOT NULL DEFAULT 0,
      created_dt       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_dt       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      active_flg       BOOLEAN NOT NULL DEFAULT TRUE,
      comandas_ativo   BOOLEAN NOT NULL DEFAULT FALSE,
      nome_empresa     VARCHAR(200),
      cnpj             VARCHAR(20),
      telefone         VARCHAR(20),
      endereco         VARCHAR(300),
      logo_url         VARCHAR(500)
    )
  `)
  console.log('✓ t_configuracoes_tenant criada')

  await client.query(`
    INSERT INTO t_configuracoes_tenant (created_dt, updated_dt, comandas_ativo)
    SELECT NOW(), NOW(), FALSE
    WHERE NOT EXISTS (SELECT 1 FROM t_configuracoes_tenant)
  `)
  console.log('✓ Configurações iniciais inseridas')

  await client.query(`
    CREATE TABLE IF NOT EXISTS t_comanda (
      comanda_id       SERIAL PRIMARY KEY,
      modification_num INTEGER NOT NULL DEFAULT 0,
      created_dt       TIMESTAMPTZ NOT NULL,
      created_by       INTEGER NOT NULL,
      updated_dt       TIMESTAMPTZ NOT NULL,
      updated_by       INTEGER NOT NULL,
      active_flg       BOOLEAN NOT NULL DEFAULT TRUE,
      identificacao    VARCHAR(100) NOT NULL,
      cliente_id       INTEGER,
      status           VARCHAR(20) NOT NULL DEFAULT 'aberta',
      observacao       VARCHAR(500),
      desconto         INTEGER NOT NULL DEFAULT 0,
      total            INTEGER NOT NULL DEFAULT 0,
      venda_id         INTEGER,
      aberta_em        TIMESTAMPTZ NOT NULL,
      fechada_em       TIMESTAMPTZ
    )
  `)
  console.log('✓ t_comanda criada')

  await client.query(`
    CREATE TABLE IF NOT EXISTS t_comanda_item (
      item_id          SERIAL PRIMARY KEY,
      modification_num INTEGER NOT NULL DEFAULT 0,
      created_dt       TIMESTAMPTZ NOT NULL,
      created_by       INTEGER NOT NULL,
      updated_dt       TIMESTAMPTZ NOT NULL,
      updated_by       INTEGER NOT NULL,
      active_flg       BOOLEAN NOT NULL DEFAULT TRUE,
      comanda_id       INTEGER NOT NULL,
      produto_id       INTEGER NOT NULL,
      nome_produto     VARCHAR(200) NOT NULL,
      quantidade       INTEGER NOT NULL DEFAULT 1,
      preco_unitario   INTEGER NOT NULL,
      subtotal         INTEGER NOT NULL,
      observacao       VARCHAR(200)
    )
  `)
  console.log('✓ t_comanda_item criada')

  await client.query(`
    CREATE TABLE IF NOT EXISTS t_venda (
      venda_id         SERIAL PRIMARY KEY,
      modification_num INTEGER NOT NULL DEFAULT 0,
      created_dt       TIMESTAMPTZ NOT NULL,
      created_by       INTEGER NOT NULL,
      updated_dt       TIMESTAMPTZ NOT NULL,
      updated_by       INTEGER NOT NULL,
      active_flg       BOOLEAN NOT NULL DEFAULT TRUE,
      origem           VARCHAR(20) NOT NULL DEFAULT 'direta',
      comanda_id       INTEGER,
      cliente_id       INTEGER,
      status           VARCHAR(20) NOT NULL DEFAULT 'concluida',
      subtotal         INTEGER NOT NULL DEFAULT 0,
      desconto         INTEGER NOT NULL DEFAULT 0,
      total            INTEGER NOT NULL DEFAULT 0,
      observacao       VARCHAR(500),
      vendida_em       TIMESTAMPTZ NOT NULL
    )
  `)
  console.log('✓ t_venda criada')

  await client.query(`
    CREATE TABLE IF NOT EXISTS t_venda_item (
      item_id          SERIAL PRIMARY KEY,
      modification_num INTEGER NOT NULL DEFAULT 0,
      created_dt       TIMESTAMPTZ NOT NULL,
      created_by       INTEGER NOT NULL,
      updated_dt       TIMESTAMPTZ NOT NULL,
      updated_by       INTEGER NOT NULL,
      active_flg       BOOLEAN NOT NULL DEFAULT TRUE,
      venda_id         INTEGER NOT NULL,
      produto_id       INTEGER NOT NULL,
      nome_produto     VARCHAR(200) NOT NULL,
      quantidade       INTEGER NOT NULL DEFAULT 1,
      preco_unitario   INTEGER NOT NULL,
      subtotal         INTEGER NOT NULL
    )
  `)
  console.log('✓ t_venda_item criada')

  await client.query(`
    CREATE TABLE IF NOT EXISTS t_venda_pagamento (
      pagamento_id     SERIAL PRIMARY KEY,
      modification_num INTEGER NOT NULL DEFAULT 0,
      created_dt       TIMESTAMPTZ NOT NULL,
      created_by       INTEGER NOT NULL,
      updated_dt       TIMESTAMPTZ NOT NULL,
      updated_by       INTEGER NOT NULL,
      active_flg       BOOLEAN NOT NULL DEFAULT TRUE,
      venda_id         INTEGER NOT NULL,
      forma            VARCHAR(50) NOT NULL,
      valor            INTEGER NOT NULL
    )
  `)
  console.log('✓ t_venda_pagamento criada')

  console.log('\n✅ Migration concluída!\n')
  client.release()
  pool.end()
}).catch(err => {
  console.error('Erro:', err.message)
  process.exit(1)
})