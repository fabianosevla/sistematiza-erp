/**
 * Migration: Compras fim a fim
 * Requisição → MRP → Lista de Compras → Cotação → Pedido de Compra → Conferência
 *
 * Migra os dados existentes em t_compra_insumo para t_pedido_compra
 * (a tabela antiga NÃO é apagada, só deixa de ser usada daqui pra frente).
 *
 * Rodar: node scripts/migrate-compras-completo.js
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
  console.log(`\nMigrando Compras completo — schema: ${SCHEMA}\n`)
  await client.query(`SET search_path TO "${SCHEMA}", public`)

  // ── 1. Requisição de Material ────────────────────────────────────────────
  await client.query(`
    CREATE TABLE IF NOT EXISTS t_requisicao_material (
      requisicao_id      SERIAL PRIMARY KEY,
      modification_num   INTEGER NOT NULL DEFAULT 0,
      created_dt         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by         INTEGER NOT NULL DEFAULT 1,
      updated_dt         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by         INTEGER NOT NULL DEFAULT 1,
      active_flg         BOOLEAN NOT NULL DEFAULT TRUE,
      data_solicitacao   DATE NOT NULL DEFAULT CURRENT_DATE,
      data_entrega       DATE,
      motivo             VARCHAR(300),
      prioridade         VARCHAR(20) NOT NULL DEFAULT 'normal',
      departamento       VARCHAR(100),
      usuario_solicitante VARCHAR(100),
      status             VARCHAR(20) NOT NULL DEFAULT 'pendente'
    )
  `)
  await client.query(`
    CREATE TABLE IF NOT EXISTS t_requisicao_item (
      item_id           SERIAL PRIMARY KEY,
      modification_num  INTEGER NOT NULL DEFAULT 0,
      created_dt        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by        INTEGER NOT NULL DEFAULT 1,
      updated_dt        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by        INTEGER NOT NULL DEFAULT 1,
      active_flg        BOOLEAN NOT NULL DEFAULT TRUE,
      requisicao_id     INTEGER NOT NULL,
      insumo_id         INTEGER NOT NULL,
      nome_insumo       VARCHAR(200) NOT NULL,
      quantidade        NUMERIC(10,3) NOT NULL,
      unidade           VARCHAR(20),
      observacao        VARCHAR(300)
    )
  `)
  console.log('✓ t_requisicao_material / t_requisicao_item criadas')

  // ── 2. Lista de Compras ──────────────────────────────────────────────────
  await client.query(`
    CREATE TABLE IF NOT EXISTS t_lista_compra (
      lista_id           SERIAL PRIMARY KEY,
      modification_num   INTEGER NOT NULL DEFAULT 0,
      created_dt         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by         INTEGER NOT NULL DEFAULT 1,
      updated_dt         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by         INTEGER NOT NULL DEFAULT 1,
      active_flg         BOOLEAN NOT NULL DEFAULT TRUE,
      descricao          VARCHAR(200),
      data_geracao       DATE NOT NULL DEFAULT CURRENT_DATE,
      previsao_entrega   DATE,
      previsao_pagamento DATE,
      origem             VARCHAR(20) NOT NULL DEFAULT 'manual',
      status             VARCHAR(20) NOT NULL DEFAULT 'aberta'
    )
  `)
  await client.query(`
    CREATE TABLE IF NOT EXISTS t_lista_compra_item (
      item_id             SERIAL PRIMARY KEY,
      modification_num    INTEGER NOT NULL DEFAULT 0,
      created_dt          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by          INTEGER NOT NULL DEFAULT 1,
      updated_dt          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by          INTEGER NOT NULL DEFAULT 1,
      active_flg           BOOLEAN NOT NULL DEFAULT TRUE,
      lista_id             INTEGER NOT NULL,
      insumo_id            INTEGER NOT NULL,
      nome_insumo          VARCHAR(200) NOT NULL,
      quantidade_sugerida  NUMERIC(10,3) NOT NULL DEFAULT 0,
      estoque_no_momento   NUMERIC(10,3) NOT NULL DEFAULT 0,
      observacao           VARCHAR(300)
    )
  `)
  console.log('✓ t_lista_compra / t_lista_compra_item criadas')

  // ── 3. Cotação ────────────────────────────────────────────────────────────
  await client.query(`
    CREATE TABLE IF NOT EXISTS t_cotacao (
      cotacao_id         SERIAL PRIMARY KEY,
      modification_num   INTEGER NOT NULL DEFAULT 0,
      created_dt         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by         INTEGER NOT NULL DEFAULT 1,
      updated_dt         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by         INTEGER NOT NULL DEFAULT 1,
      active_flg         BOOLEAN NOT NULL DEFAULT TRUE,
      lista_id           INTEGER NOT NULL,
      status              VARCHAR(20) NOT NULL DEFAULT 'pendente'
    )
  `)
  await client.query(`
    CREATE TABLE IF NOT EXISTS t_cotacao_item (
      item_id             SERIAL PRIMARY KEY,
      modification_num    INTEGER NOT NULL DEFAULT 0,
      created_dt           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by            INTEGER NOT NULL DEFAULT 1,
      updated_dt            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by             INTEGER NOT NULL DEFAULT 1,
      active_flg              BOOLEAN NOT NULL DEFAULT TRUE,
      cotacao_id               INTEGER NOT NULL,
      insumo_id                INTEGER NOT NULL,
      nome_insumo              VARCHAR(200) NOT NULL,
      fornecedor_id            INTEGER,
      nome_fornecedor          VARCHAR(200) NOT NULL,
      preco_unitario           INTEGER NOT NULL DEFAULT 0,
      quantidade               NUMERIC(10,3) NOT NULL DEFAULT 0,
      selecionado              BOOLEAN NOT NULL DEFAULT FALSE
    )
  `)
  console.log('✓ t_cotacao / t_cotacao_item criadas')

  // ── 4. Pedido de Compra ──────────────────────────────────────────────────
  await client.query(`
    CREATE TABLE IF NOT EXISTS t_pedido_compra (
      pedido_id           SERIAL PRIMARY KEY,
      modification_num    INTEGER NOT NULL DEFAULT 0,
      created_dt           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by            INTEGER NOT NULL DEFAULT 1,
      updated_dt             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by              INTEGER NOT NULL DEFAULT 1,
      active_flg               BOOLEAN NOT NULL DEFAULT TRUE,
      lista_id                 INTEGER,
      fornecedor_id             INTEGER,
      nome_fornecedor           VARCHAR(200) NOT NULL,
      data_pedido               DATE NOT NULL DEFAULT CURRENT_DATE,
      previsao_entrega          DATE,
      status                    VARCHAR(20) NOT NULL DEFAULT 'aberto',
      valor_total               INTEGER NOT NULL DEFAULT 0,
      observacao                VARCHAR(500)
    )
  `)
  await client.query(`
    CREATE TABLE IF NOT EXISTS t_pedido_compra_item (
      item_id                  SERIAL PRIMARY KEY,
      modification_num         INTEGER NOT NULL DEFAULT 0,
      created_dt                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by                 INTEGER NOT NULL DEFAULT 1,
      updated_dt                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by                   INTEGER NOT NULL DEFAULT 1,
      active_flg                    BOOLEAN NOT NULL DEFAULT TRUE,
      pedido_id                     INTEGER NOT NULL,
      insumo_id                     INTEGER,
      nome_insumo                   VARCHAR(200) NOT NULL,
      quantidade                    NUMERIC(10,3) NOT NULL DEFAULT 0,
      preco_unitario                INTEGER NOT NULL DEFAULT 0,
      subtotal                      INTEGER NOT NULL DEFAULT 0,
      quantidade_recebida           NUMERIC(10,3) NOT NULL DEFAULT 0
    )
  `)
  console.log('✓ t_pedido_compra / t_pedido_compra_item criadas')

  // ── 5. Conferência de Recebimento ────────────────────────────────────────
  await client.query(`
    CREATE TABLE IF NOT EXISTS t_conferencia_recebimento (
      conferencia_id        SERIAL PRIMARY KEY,
      modification_num      INTEGER NOT NULL DEFAULT 0,
      created_dt              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by               INTEGER NOT NULL DEFAULT 1,
      updated_dt                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by                 INTEGER NOT NULL DEFAULT 1,
      active_flg                  BOOLEAN NOT NULL DEFAULT TRUE,
      pedido_id                   INTEGER NOT NULL,
      data_recebimento            DATE NOT NULL DEFAULT CURRENT_DATE,
      status                      VARCHAR(20) NOT NULL DEFAULT 'em_andamento',
      observacao                  VARCHAR(500)
    )
  `)
  await client.query(`
    CREATE TABLE IF NOT EXISTS t_conferencia_item (
      item_id                    SERIAL PRIMARY KEY,
      modification_num           INTEGER NOT NULL DEFAULT 0,
      created_dt                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by                   INTEGER NOT NULL DEFAULT 1,
      updated_dt                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by                     INTEGER NOT NULL DEFAULT 1,
      active_flg                      BOOLEAN NOT NULL DEFAULT TRUE,
      conferencia_id                  INTEGER NOT NULL,
      pedido_item_id                  INTEGER NOT NULL,
      insumo_id                       INTEGER,
      nome_insumo                     VARCHAR(200) NOT NULL,
      quantidade_pedida               NUMERIC(10,3) NOT NULL DEFAULT 0,
      quantidade_recebida             NUMERIC(10,3) NOT NULL DEFAULT 0,
      conforme                        BOOLEAN NOT NULL DEFAULT FALSE
    )
  `)
  console.log('✓ t_conferencia_recebimento / t_conferencia_item criadas')

  // ── 6. Índices ────────────────────────────────────────────────────────────
  await client.query(`CREATE INDEX IF NOT EXISTS idx_req_item_req      ON t_requisicao_item (requisicao_id)`)
  await client.query(`CREATE INDEX IF NOT EXISTS idx_lista_item_lista  ON t_lista_compra_item (lista_id)`)
  await client.query(`CREATE INDEX IF NOT EXISTS idx_cotacao_item_cot  ON t_cotacao_item (cotacao_id)`)
  await client.query(`CREATE INDEX IF NOT EXISTS idx_pedido_item_ped   ON t_pedido_compra_item (pedido_id)`)
  await client.query(`CREATE INDEX IF NOT EXISTS idx_conf_item_conf    ON t_conferencia_item (conferencia_id)`)
  await client.query(`CREATE INDEX IF NOT EXISTS idx_pedido_status     ON t_pedido_compra (status)`)
  console.log('✓ Índices criados')

  // ── 7. Toggle no configuracoes_tenant ────────────────────────────────────
  await client.query(`ALTER TABLE t_configuracoes_tenant ADD COLUMN IF NOT EXISTS modulo_compras_ativo BOOLEAN DEFAULT TRUE`)
  console.log('✓ Toggle modulo_compras_ativo adicionado')

  // ── 8. MIGRAÇÃO DE DADOS: t_compra_insumo → t_pedido_compra ──────────────
  const existing = await client.query(`
    SELECT * FROM t_compra_insumo WHERE active_flg = true ORDER BY compra_id
  `)
  let migrados = 0
  for (const row of existing.rows) {
    const status = row.status === 'pago' ? 'recebido' : 'aberto'
    const qtd    = parseFloat(row.qtd_total) > 0 ? parseFloat(row.qtd_total) : parseFloat(row.quantidade)
    const valorTotal = Math.round(row.valor_unitario * qtd)

    const pedidoRes = await client.query(`
      INSERT INTO t_pedido_compra (
        fornecedor_id, nome_fornecedor, data_pedido, status, valor_total,
        observacao, created_dt, updated_dt, created_by, updated_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $7, 1, 1)
      RETURNING pedido_id
    `, [
      row.fornecedor_id,
      row.nome_fornecedor || 'Fornecedor não informado',
      row.data_entrada,
      status,
      valorTotal,
      `Migrado automaticamente do registro de compras anterior (#${row.compra_id})${row.observacao ? ' — ' + row.observacao : ''}`,
      row.created_dt || new Date().toISOString(),
    ])
    const pedidoId = pedidoRes.rows[0].pedido_id

    await client.query(`
      INSERT INTO t_pedido_compra_item (
        pedido_id, insumo_id, nome_insumo, quantidade, preco_unitario, subtotal,
        quantidade_recebida, created_dt, updated_dt, created_by, updated_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, 1, 1)
    `, [
      pedidoId, row.insumo_id, row.nome_insumo, qtd, row.valor_unitario, valorTotal,
      status === 'recebido' ? qtd : 0,
      row.created_dt || new Date().toISOString(),
    ])
    migrados++
  }
  console.log(`✓ ${migrados} compra(s) antiga(s) migrada(s) para t_pedido_compra`)

  console.log('\n✅ Migration Compras completo concluída!\n')
  client.release()
  pool.end()
}).catch(err => { console.error('Erro:', err.message); process.exit(1) })