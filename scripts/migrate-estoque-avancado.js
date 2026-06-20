/**
 * Migration: Estoque Avançado
 * - Múltiplos locais/depósitos (detalhe por local, sem mexer no agregado existente)
 * - Entrada via XML de NF-e
 * - Perda de Produto/Insumo
 * - Contagem de Inventário
 *
 * Rodar: node scripts/migrate-estoque-avancado.js
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
  console.log(`\nMigrando Estoque Avançado — schema: ${SCHEMA}\n`)
  await client.query(`SET search_path TO "${SCHEMA}", public`)

  // ── 1. Locais / Depósitos ────────────────────────────────────────────────
  await client.query(`
    CREATE TABLE IF NOT EXISTS t_local_estoque (
      local_id           SERIAL PRIMARY KEY,
      modification_num   INTEGER NOT NULL DEFAULT 0,
      created_dt         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by         INTEGER NOT NULL DEFAULT 1,
      updated_dt         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by         INTEGER NOT NULL DEFAULT 1,
      active_flg         BOOLEAN NOT NULL DEFAULT TRUE,
      nome               VARCHAR(150) NOT NULL,
      descricao          VARCHAR(300),
      padrao             BOOLEAN NOT NULL DEFAULT FALSE
    )
  `)
  await client.query(`
    CREATE TABLE IF NOT EXISTS t_estoque_local (
      estoque_local_id   SERIAL PRIMARY KEY,
      modification_num   INTEGER NOT NULL DEFAULT 0,
      created_dt         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by         INTEGER NOT NULL DEFAULT 1,
      updated_dt         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by         INTEGER NOT NULL DEFAULT 1,
      active_flg         BOOLEAN NOT NULL DEFAULT TRUE,
      local_id           INTEGER NOT NULL,
      entidade           VARCHAR(10) NOT NULL,
      entidade_id        INTEGER NOT NULL,
      quantidade         NUMERIC(10,3) NOT NULL DEFAULT 0,
      UNIQUE(local_id, entidade, entidade_id)
    )
  `)
  await client.query(`
    CREATE TABLE IF NOT EXISTS t_transferencia_estoque (
      transferencia_id    SERIAL PRIMARY KEY,
      modification_num    INTEGER NOT NULL DEFAULT 0,
      created_dt           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by            INTEGER NOT NULL DEFAULT 1,
      updated_dt             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by              INTEGER NOT NULL DEFAULT 1,
      active_flg               BOOLEAN NOT NULL DEFAULT TRUE,
      local_origem_id           INTEGER NOT NULL,
      local_destino_id          INTEGER NOT NULL,
      entidade                  VARCHAR(10) NOT NULL,
      entidade_id               INTEGER NOT NULL,
      nome_entidade              VARCHAR(200) NOT NULL,
      quantidade                 NUMERIC(10,3) NOT NULL,
      data_transferencia          DATE NOT NULL,
      observacao                  VARCHAR(300)
    )
  `)
  // Cria o local padrão — todo estoque existente "mora" aqui até o usuário
  // decidir distribuir entre locais
  const localPadrao = await client.query(`
    INSERT INTO t_local_estoque (nome, descricao, padrao)
    SELECT 'Loja / Produção', 'Local principal — criado automaticamente', true
    WHERE NOT EXISTS (SELECT 1 FROM t_local_estoque WHERE padrao = true)
    RETURNING local_id
  `)
  console.log(`✓ t_local_estoque / t_estoque_local / t_transferencia_estoque criadas (local padrão: ${localPadrao.rows[0]?.local_id ?? 'já existia'})`)

  // ── 2. Perda de Produto/Insumo ───────────────────────────────────────────
  await client.query(`
    CREATE TABLE IF NOT EXISTS t_perda_estoque (
      perda_id           SERIAL PRIMARY KEY,
      modification_num   INTEGER NOT NULL DEFAULT 0,
      created_dt          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by           INTEGER NOT NULL DEFAULT 1,
      updated_dt            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by             INTEGER NOT NULL DEFAULT 1,
      active_flg              BOOLEAN NOT NULL DEFAULT TRUE,
      entidade                 VARCHAR(10) NOT NULL,
      entidade_id               INTEGER NOT NULL,
      nome_entidade              VARCHAR(200) NOT NULL,
      quantidade                 NUMERIC(10,3) NOT NULL,
      motivo                     VARCHAR(30) NOT NULL,
      data_perda                 DATE NOT NULL,
      observacao                 VARCHAR(300),
      local_id                   INTEGER,
      valor_estimado              INTEGER NOT NULL DEFAULT 0
    )
  `)
  console.log('✓ t_perda_estoque criada')

  // ── 3. Contagem de Inventário ────────────────────────────────────────────
  await client.query(`
    CREATE TABLE IF NOT EXISTS t_contagem_inventario (
      contagem_id          SERIAL PRIMARY KEY,
      modification_num     INTEGER NOT NULL DEFAULT 0,
      created_dt             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by              INTEGER NOT NULL DEFAULT 1,
      updated_dt                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by                 INTEGER NOT NULL DEFAULT 1,
      active_flg                  BOOLEAN NOT NULL DEFAULT TRUE,
      descricao                    VARCHAR(200),
      data_contagem                 DATE NOT NULL,
      status                        VARCHAR(20) NOT NULL DEFAULT 'aberta',
      local_id                      INTEGER
    )
  `)
  await client.query(`
    CREATE TABLE IF NOT EXISTS t_contagem_inventario_item (
      item_id                      SERIAL PRIMARY KEY,
      modification_num             INTEGER NOT NULL DEFAULT 0,
      created_dt                     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by                      INTEGER NOT NULL DEFAULT 1,
      updated_dt                        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by                         INTEGER NOT NULL DEFAULT 1,
      active_flg                          BOOLEAN NOT NULL DEFAULT TRUE,
      contagem_id                          INTEGER NOT NULL,
      entidade                              VARCHAR(10) NOT NULL,
      entidade_id                           INTEGER NOT NULL,
      nome_entidade                         VARCHAR(200) NOT NULL,
      quantidade_sistema                    NUMERIC(10,3) NOT NULL DEFAULT 0,
      quantidade_contada                    NUMERIC(10,3),
      diferenca                             NUMERIC(10,3)
    )
  `)
  console.log('✓ t_contagem_inventario / t_contagem_inventario_item criadas')

  // ── 4. Entrada via XML de NF-e ───────────────────────────────────────────
  await client.query(`
    CREATE TABLE IF NOT EXISTS t_entrada_nfe (
      entrada_id           SERIAL PRIMARY KEY,
      modification_num     INTEGER NOT NULL DEFAULT 0,
      created_dt             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by              INTEGER NOT NULL DEFAULT 1,
      updated_dt                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by                 INTEGER NOT NULL DEFAULT 1,
      active_flg                  BOOLEAN NOT NULL DEFAULT TRUE,
      chave_acesso                 VARCHAR(44),
      numero_nfe                    VARCHAR(20),
      nome_fornecedor                VARCHAR(200),
      cnpj_fornecedor                 VARCHAR(20),
      data_emissao                    DATE,
      valor_total                      INTEGER NOT NULL DEFAULT 0,
      status                            VARCHAR(20) NOT NULL DEFAULT 'pendente',
      pedido_id                         INTEGER
    )
  `)
  await client.query(`
    CREATE TABLE IF NOT EXISTS t_entrada_nfe_item (
      item_id                          SERIAL PRIMARY KEY,
      modification_num                 INTEGER NOT NULL DEFAULT 0,
      created_dt                         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by                          INTEGER NOT NULL DEFAULT 1,
      updated_dt                            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by                             INTEGER NOT NULL DEFAULT 1,
      active_flg                              BOOLEAN NOT NULL DEFAULT TRUE,
      entrada_id                               INTEGER NOT NULL,
      codigo_xml                                VARCHAR(60),
      descricao_xml                              VARCHAR(300) NOT NULL,
      ncm                                        VARCHAR(10),
      quantidade                                 NUMERIC(10,3) NOT NULL,
      valor_unitario                             INTEGER NOT NULL,
      valor_total                                INTEGER NOT NULL,
      insumo_id                                  INTEGER
    )
  `)
  console.log('✓ t_entrada_nfe / t_entrada_nfe_item criadas')

  // ── 5. Índices ────────────────────────────────────────────────────────────
  await client.query(`CREATE INDEX IF NOT EXISTS idx_estoque_local_lookup ON t_estoque_local (local_id, entidade, entidade_id)`)
  await client.query(`CREATE INDEX IF NOT EXISTS idx_perda_entidade        ON t_perda_estoque (entidade, entidade_id)`)
  await client.query(`CREATE INDEX IF NOT EXISTS idx_contagem_item_cont    ON t_contagem_inventario_item (contagem_id)`)
  await client.query(`CREATE INDEX IF NOT EXISTS idx_nfe_item_entrada      ON t_entrada_nfe_item (entrada_id)`)
  console.log('✓ Índices criados')

  // ── 6. Toggles em t_configuracoes_tenant ─────────────────────────────────
  await client.query(`ALTER TABLE t_configuracoes_tenant ADD COLUMN IF NOT EXISTS entrada_nfe_ativo BOOLEAN DEFAULT TRUE`)
  await client.query(`ALTER TABLE t_configuracoes_tenant ADD COLUMN IF NOT EXISTS perda_produto_ativo BOOLEAN DEFAULT TRUE`)
  await client.query(`ALTER TABLE t_configuracoes_tenant ADD COLUMN IF NOT EXISTS contagem_inventario_ativo BOOLEAN DEFAULT TRUE`)
  await client.query(`ALTER TABLE t_configuracoes_tenant ADD COLUMN IF NOT EXISTS multiplos_locais_ativo BOOLEAN DEFAULT FALSE`)
  console.log('✓ Toggles adicionados (multiplos_locais_ativo começa desligado por padrão)')

  console.log('\n✅ Migration Estoque Avançado concluída!\n')
  client.release()
  pool.end()
}).catch(err => { console.error('Erro:', err.message); process.exit(1) })