require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

const pool = new Pool({
  host: process.env.DB_HOST, port: 5432,
  database: process.env.DB_NAME, user: process.env.DB_USER,
  password: process.env.DB_PASSWORD, ssl: { rejectUnauthorized: false },
})

const SCHEMA = 'tenant_zaghi_massas_caseiras'

pool.connect().then(async client => {
  console.log(`\nMigrando colunas fiscais no schema: ${SCHEMA}\n`)
  await client.query(`SET search_path TO "${SCHEMA}", public`)

  await client.query(`ALTER TABLE t_configuracoes_tenant ADD COLUMN IF NOT EXISTS ie_estadual VARCHAR(30)`)
  await client.query(`ALTER TABLE t_configuracoes_tenant ADD COLUMN IF NOT EXISTS regime_tributario VARCHAR(5)`)
  await client.query(`ALTER TABLE t_configuracoes_tenant ADD COLUMN IF NOT EXISTS uf VARCHAR(2)`)
  await client.query(`ALTER TABLE t_configuracoes_tenant ADD COLUMN IF NOT EXISTS focus_nfe_token VARCHAR(200)`)
  await client.query(`ALTER TABLE t_configuracoes_tenant ADD COLUMN IF NOT EXISTS focus_nfe_ambiente VARCHAR(20) DEFAULT 'homologacao'`)
  console.log('✓ Colunas fiscais adicionadas')

  await client.query(`
    CREATE TABLE IF NOT EXISTS t_turno_caixa (
      turno_id         SERIAL PRIMARY KEY,
      modification_num INTEGER NOT NULL DEFAULT 0,
      created_dt       TIMESTAMPTZ NOT NULL,
      created_by       INTEGER NOT NULL,
      updated_dt       TIMESTAMPTZ NOT NULL,
      updated_by       INTEGER NOT NULL,
      active_flg       BOOLEAN NOT NULL DEFAULT TRUE,
      numero_caixa     INTEGER NOT NULL DEFAULT 1,
      operador         VARCHAR(100) NOT NULL,
      aberto_em        TIMESTAMPTZ NOT NULL,
      fechado_em       TIMESTAMPTZ,
      status           VARCHAR(20) NOT NULL DEFAULT 'aberto',
      valor_abertura   INTEGER NOT NULL DEFAULT 0,
      valor_fechamento INTEGER,
      observacao       VARCHAR(500)
    )
  `)
  console.log('✓ t_turno_caixa OK')

  await client.query(`
    CREATE TABLE IF NOT EXISTS t_nota_fiscal (
      nota_id             SERIAL PRIMARY KEY,
      modification_num    INTEGER NOT NULL DEFAULT 0,
      created_dt          TIMESTAMPTZ NOT NULL,
      created_by          INTEGER NOT NULL,
      updated_dt          TIMESTAMPTZ NOT NULL,
      updated_by          INTEGER NOT NULL,
      active_flg          BOOLEAN NOT NULL DEFAULT TRUE,
      tipo                VARCHAR(10) NOT NULL,
      numero              VARCHAR(20),
      serie               VARCHAR(5),
      chave_acesso        VARCHAR(50),
      status              VARCHAR(20) NOT NULL DEFAULT 'pendente',
      data_emissao        TIMESTAMPTZ,
      cnpj_cpf            VARCHAR(20),
      razao_social        VARCHAR(300),
      uf                  VARCHAR(2),
      ie                  VARCHAR(20),
      cfop                VARCHAR(10),
      valor_produtos      INTEGER NOT NULL DEFAULT 0,
      valor_desconto      INTEGER NOT NULL DEFAULT 0,
      valor_frete         INTEGER NOT NULL DEFAULT 0,
      valor_seguro        INTEGER NOT NULL DEFAULT 0,
      valor_ipi           INTEGER NOT NULL DEFAULT 0,
      valor_icms          INTEGER NOT NULL DEFAULT 0,
      valor_total         INTEGER NOT NULL DEFAULT 0,
      xml_url             VARCHAR(500),
      danfe_url           VARCHAR(500),
      venda_id            INTEGER,
      observacao          VARCHAR(1000),
      motivo_cancelamento VARCHAR(500)
    )
  `)
  console.log('✓ t_nota_fiscal OK')

  await client.query(`
    CREATE TABLE IF NOT EXISTS t_nota_fiscal_item (
      item_id          SERIAL PRIMARY KEY,
      modification_num INTEGER NOT NULL DEFAULT 0,
      created_dt       TIMESTAMPTZ NOT NULL,
      created_by       INTEGER NOT NULL,
      updated_dt       TIMESTAMPTZ NOT NULL,
      updated_by       INTEGER NOT NULL,
      active_flg       BOOLEAN NOT NULL DEFAULT TRUE,
      nota_id          INTEGER NOT NULL,
      produto_id       INTEGER,
      codigo           VARCHAR(60),
      descricao        VARCHAR(300) NOT NULL,
      ncm              VARCHAR(10),
      cfop             VARCHAR(10),
      unidade          VARCHAR(6),
      quantidade       NUMERIC(10,4) NOT NULL DEFAULT 0,
      preco_unitario   INTEGER NOT NULL DEFAULT 0,
      valor_desconto   INTEGER NOT NULL DEFAULT 0,
      valor_total      INTEGER NOT NULL DEFAULT 0,
      cst_csosn        VARCHAR(10),
      aliq_icms        NUMERIC(5,2) NOT NULL DEFAULT 0,
      valor_icms       INTEGER NOT NULL DEFAULT 0,
      aliq_ipi         NUMERIC(5,2) NOT NULL DEFAULT 0,
      valor_ipi        INTEGER NOT NULL DEFAULT 0,
      base_st          INTEGER NOT NULL DEFAULT 0,
      valor_st         INTEGER NOT NULL DEFAULT 0
    )
  `)
  console.log('✓ t_nota_fiscal_item OK')

  console.log('\n✅ Migration fiscal concluída!\n')
  client.release()
  pool.end()
}).catch(err => { console.error('Erro:', err.message); process.exit(1) })