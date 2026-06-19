/**
 * Migration: Financeiro Completo
 * - t_conta_pagar (Contas a Pagar)
 * - t_conta_receber (Contas a Receber)
 * - t_conta_bancaria (Contas Bancárias)
 * - t_extrato_bancario (Extrato / OFX)
 * - toggles em t_configuracoes_tenant
 *
 * Rodar: node scripts/migrate-financeiro-completo.js
 */
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

const pool = new Pool({
  host: process.env.DB_HOST, port: 5432,
  database: process.env.DB_NAME, user: process.env.DB_USER,
  password: process.env.DB_PASSWORD, ssl: { rejectUnauthorized: false },
})

const SCHEMA = 'tenant_zaghi_massas_caseiras'

pool.connect().then(async client => {
  console.log(`\nMigrando financeiro completo — schema: ${SCHEMA}\n`)
  await client.query(`SET search_path TO "${SCHEMA}", public`)

  // ── Contas a Pagar ────────────────────────────────────────────────────────
  await client.query(`
    CREATE TABLE IF NOT EXISTS t_conta_pagar (
      conta_pagar_id   SERIAL PRIMARY KEY,
      modification_num INTEGER NOT NULL DEFAULT 0,
      created_dt       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by       INTEGER NOT NULL DEFAULT 1,
      updated_dt       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by       INTEGER NOT NULL DEFAULT 1,
      active_flg       BOOLEAN NOT NULL DEFAULT TRUE,
      -- Dados do título
      descricao        VARCHAR(300) NOT NULL,
      fornecedor_id    INTEGER,
      nome_fornecedor  VARCHAR(200),
      categoria        VARCHAR(100),
      numero_documento VARCHAR(50),
      -- Valores em centavos
      valor_original   INTEGER NOT NULL,
      valor_pago       INTEGER NOT NULL DEFAULT 0,
      -- Datas
      data_emissao     DATE NOT NULL,
      data_vencimento  DATE NOT NULL,
      data_pagamento   DATE,
      -- Status: aberta | paga | vencida | cancelada
      status           VARCHAR(20) NOT NULL DEFAULT 'aberta',
      forma_pagamento  VARCHAR(50),
      observacao       VARCHAR(500),
      -- Origem: manual | compra | nfe
      origem           VARCHAR(20) NOT NULL DEFAULT 'manual',
      origem_id        INTEGER,
      -- Parcelas
      parcela_atual    INTEGER NOT NULL DEFAULT 1,
      total_parcelas   INTEGER NOT NULL DEFAULT 1,
      conta_pai_id     INTEGER,
      -- Conta bancária usada no pagamento
      conta_bancaria_id INTEGER
    )
  `)
  console.log('✓ t_conta_pagar criada')

  // ── Contas a Receber ──────────────────────────────────────────────────────
  await client.query(`
    CREATE TABLE IF NOT EXISTS t_conta_receber (
      conta_receber_id  SERIAL PRIMARY KEY,
      modification_num  INTEGER NOT NULL DEFAULT 0,
      created_dt        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by        INTEGER NOT NULL DEFAULT 1,
      updated_dt        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by        INTEGER NOT NULL DEFAULT 1,
      active_flg        BOOLEAN NOT NULL DEFAULT TRUE,
      descricao         VARCHAR(300) NOT NULL,
      cliente_id        INTEGER,
      nome_cliente      VARCHAR(200),
      categoria         VARCHAR(100),
      numero_documento  VARCHAR(50),
      valor_original    INTEGER NOT NULL,
      valor_recebido    INTEGER NOT NULL DEFAULT 0,
      data_emissao      DATE NOT NULL,
      data_vencimento   DATE NOT NULL,
      data_recebimento  DATE,
      -- Status: aberta | recebida | vencida | cancelada
      status            VARCHAR(20) NOT NULL DEFAULT 'aberta',
      forma_recebimento VARCHAR(50),
      observacao        VARCHAR(500),
      origem            VARCHAR(20) NOT NULL DEFAULT 'manual',
      origem_id         INTEGER,
      parcela_atual     INTEGER NOT NULL DEFAULT 1,
      total_parcelas    INTEGER NOT NULL DEFAULT 1,
      conta_pai_id      INTEGER,
      conta_bancaria_id INTEGER
    )
  `)
  console.log('✓ t_conta_receber criada')

  // ── Contas Bancárias ──────────────────────────────────────────────────────
  await client.query(`
    CREATE TABLE IF NOT EXISTS t_conta_bancaria (
      conta_bancaria_id SERIAL PRIMARY KEY,
      modification_num  INTEGER NOT NULL DEFAULT 0,
      created_dt        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by        INTEGER NOT NULL DEFAULT 1,
      updated_dt        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by        INTEGER NOT NULL DEFAULT 1,
      active_flg        BOOLEAN NOT NULL DEFAULT TRUE,
      nome              VARCHAR(100) NOT NULL,
      banco             VARCHAR(100),
      agencia           VARCHAR(20),
      conta             VARCHAR(30),
      -- tipo: corrente | poupanca | investimento
      tipo              VARCHAR(20) NOT NULL DEFAULT 'corrente',
      saldo_inicial     INTEGER NOT NULL DEFAULT 0
    )
  `)
  console.log('✓ t_conta_bancaria criada')

  // ── Extrato Bancário (OFX) ────────────────────────────────────────────────
  await client.query(`
    CREATE TABLE IF NOT EXISTS t_extrato_bancario (
      extrato_id         SERIAL PRIMARY KEY,
      modification_num   INTEGER NOT NULL DEFAULT 0,
      created_dt         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by         INTEGER NOT NULL DEFAULT 1,
      updated_dt         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by         INTEGER NOT NULL DEFAULT 1,
      active_flg         BOOLEAN NOT NULL DEFAULT TRUE,
      conta_bancaria_id  INTEGER NOT NULL,
      data_movimento     DATE NOT NULL,
      descricao          VARCHAR(300),
      -- valor em centavos: positivo = crédito, negativo = débito
      valor              INTEGER NOT NULL,
      tipo               VARCHAR(10) NOT NULL, -- credito | debito
      referencia         VARCHAR(100),         -- FITID do OFX
      -- status: pendente | conciliado | ignorado
      status             VARCHAR(20) NOT NULL DEFAULT 'pendente',
      conciliado_com_tipo VARCHAR(20),         -- conta_pagar | conta_receber
      conciliado_com_id   INTEGER,
      importacao_lote    VARCHAR(50)            -- batch ID do import
    )
  `)
  console.log('✓ t_extrato_bancario criada')

  // ── Índices ───────────────────────────────────────────────────────────────
  await client.query(`CREATE INDEX IF NOT EXISTS idx_cp_status ON t_conta_pagar (status)`)
  await client.query(`CREATE INDEX IF NOT EXISTS idx_cp_vencimento ON t_conta_pagar (data_vencimento)`)
  await client.query(`CREATE INDEX IF NOT EXISTS idx_cr_status ON t_conta_receber (status)`)
  await client.query(`CREATE INDEX IF NOT EXISTS idx_cr_vencimento ON t_conta_receber (data_vencimento)`)
  await client.query(`CREATE INDEX IF NOT EXISTS idx_extrato_conta ON t_extrato_bancario (conta_bancaria_id)`)
  await client.query(`CREATE INDEX IF NOT EXISTS idx_extrato_referencia ON t_extrato_bancario (referencia)`)
  console.log('✓ Índices criados')

  // ── Toggles em t_configuracoes_tenant ─────────────────────────────────────
  await client.query(`ALTER TABLE t_configuracoes_tenant ADD COLUMN IF NOT EXISTS contas_pagar_ativo BOOLEAN DEFAULT FALSE`)
  await client.query(`ALTER TABLE t_configuracoes_tenant ADD COLUMN IF NOT EXISTS contas_receber_ativo BOOLEAN DEFAULT FALSE`)
  await client.query(`ALTER TABLE t_configuracoes_tenant ADD COLUMN IF NOT EXISTS conciliacao_bancaria_ativo BOOLEAN DEFAULT FALSE`)
  console.log('✓ Toggles adicionados em t_configuracoes_tenant')

  console.log('\n✅ Migration financeiro completo concluída!\n')
  client.release()
  pool.end()
}).catch(err => { console.error('Erro:', err.message); process.exit(1) })