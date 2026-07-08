/**
 * Migration: módulo Fidelidade (cashback + reativação WhatsApp)
 * Cria 3 tabelas em CADA schema de tenant (tenant_%):
 *   - t_fidelidade_config     (parâmetros do programa, 1 linha por tenant)
 *   - t_fidelidade_movimento  (extrato de cashback: credito/uso/estorno/ajuste/expiracao)
 *   - t_fidelidade_aviso      (log/trava dos avisos de reativação por WhatsApp)
 *
 * Idempotente: usa IF NOT EXISTS, pode rodar quantas vezes precisar.
 *
 * Rodar: node scripts/migrate-fidelidade.js
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

  // ── Configuração (1 linha por tenant) ────────────────────────────────────
  await client.query(`
    CREATE TABLE IF NOT EXISTS t_fidelidade_config (
      config_id                    SERIAL PRIMARY KEY,
      modification_num             INTEGER      NOT NULL DEFAULT 0,
      created_dt                   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      created_by                   INTEGER      NOT NULL DEFAULT 1,
      updated_dt                   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_by                   INTEGER      NOT NULL DEFAULT 1,
      active_flg                   BOOLEAN      NOT NULL DEFAULT TRUE,

      programa_ativo               BOOLEAN      NOT NULL DEFAULT FALSE,

      -- Regras de cashback
      cashback_pct_bp              INTEGER      NOT NULL DEFAULT 500,    -- basis points: 500 = 5,00%
      compra_minima_centavos       INTEGER      NOT NULL DEFAULT 0,
      validade_dias                INTEGER      NOT NULL DEFAULT 0,      -- 0 = não expira
      limite_uso_pct_bp            INTEGER      NOT NULL DEFAULT 10000,  -- 10000 = usar até 100% da venda
      saldo_minimo_uso_centavos    INTEGER      NOT NULL DEFAULT 0,
      arredondamento               VARCHAR(10)  NOT NULL DEFAULT 'centavo', -- centavo | real
      base_calculo                 VARCHAR(10)  NOT NULL DEFAULT 'liquido',  -- bruto | liquido

      -- Regras de reativação
      reativacao_ativa             BOOLEAN      NOT NULL DEFAULT FALSE,
      dias_inatividade             INTEGER      NOT NULL DEFAULT 30,
      repetir_aviso                BOOLEAN      NOT NULL DEFAULT FALSE,
      intervalo_repeticao_dias     INTEGER      NOT NULL DEFAULT 30,
      max_avisos                   INTEGER      NOT NULL DEFAULT 0,      -- 0 = ilimitado
      saldo_minimo_aviso_centavos  INTEGER      NOT NULL DEFAULT 0,
      horario_inicio               INTEGER      NOT NULL DEFAULT 9,      -- hora (0-23)
      horario_fim                  INTEGER      NOT NULL DEFAULT 20,

      -- WhatsApp (Meta Cloud API) — token guardado cifrado
      wa_phone_number_id           VARCHAR(100),
      wa_business_account_id       VARCHAR(100),
      wa_token_cipher              TEXT,
      wa_template_nome             VARCHAR(150),
      wa_template_idioma           VARCHAR(10)  NOT NULL DEFAULT 'pt_BR',

      -- Texto / conformidade
      mensagem_padrao              VARCHAR(1000),
      exige_optin                  BOOLEAN      NOT NULL DEFAULT TRUE
    )
  `)

  // ── Extrato de cashback ───────────────────────────────────────────────────
  await client.query(`
    CREATE TABLE IF NOT EXISTS t_fidelidade_movimento (
      movimento_id      SERIAL PRIMARY KEY,
      modification_num  INTEGER      NOT NULL DEFAULT 0,
      created_dt        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      created_by        INTEGER      NOT NULL DEFAULT 1,
      updated_dt        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_by        INTEGER      NOT NULL DEFAULT 1,
      active_flg        BOOLEAN      NOT NULL DEFAULT TRUE,

      cliente_id        INTEGER      NOT NULL,
      tipo              VARCHAR(20)  NOT NULL,   -- credito | uso | estorno | ajuste | expiracao
      valor_centavos    INTEGER      NOT NULL,   -- sempre positivo; 'tipo' define o sinal do saldo
      venda_id          INTEGER,
      expira_em         TIMESTAMPTZ,
      observacao        VARCHAR(300)
    )
  `)
  await client.query(`CREATE INDEX IF NOT EXISTS ix_fid_mov_cliente ON t_fidelidade_movimento (cliente_id)`)
  await client.query(`CREATE INDEX IF NOT EXISTS ix_fid_mov_venda   ON t_fidelidade_movimento (venda_id)`)

  // ── Log / trava dos avisos de reativação ─────────────────────────────────
  await client.query(`
    CREATE TABLE IF NOT EXISTS t_fidelidade_aviso (
      aviso_id                 SERIAL PRIMARY KEY,
      modification_num         INTEGER      NOT NULL DEFAULT 0,
      created_dt               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      created_by               INTEGER      NOT NULL DEFAULT 1,
      updated_dt               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_by               INTEGER      NOT NULL DEFAULT 1,
      active_flg               BOOLEAN      NOT NULL DEFAULT TRUE,

      cliente_id               INTEGER      NOT NULL,
      enviado_em               TIMESTAMPTZ,
      saldo_no_envio_centavos  INTEGER,
      sequencia                INTEGER      NOT NULL DEFAULT 1,  -- 1º, 2º aviso do ciclo
      status                   VARCHAR(20)  NOT NULL DEFAULT 'enviado', -- enviado | erro | pendente
      erro_msg                 VARCHAR(500),
      wa_message_id            VARCHAR(150)
    )
  `)
  await client.query(`CREATE INDEX IF NOT EXISTS ix_fid_aviso_cliente ON t_fidelidade_aviso (cliente_id, enviado_em)`)

  // Garante uma linha de config (defaults) por tenant.
  await client.query(`
    INSERT INTO t_fidelidade_config (config_id)
    SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM t_fidelidade_config)
  `)
}

pool.connect().then(async client => {
  const res = await client.query(`
    SELECT schema_name FROM information_schema.schemata
    WHERE schema_name LIKE 'tenant_%'
    ORDER BY schema_name
  `)
  const schemas = res.rows.map(r => r.schema_name)
  console.log(`\nFidelidade: migrando ${schemas.length} schema(s) de tenant...\n`)

  for (const schema of schemas) {
    try {
      await migrarSchema(client, schema)
      console.log(`  ✓ ${schema}`)
    } catch (e) {
      console.error(`  ✗ ${schema}: ${e.message}`)
    }
  }

  console.log('\n✅ Migration de fidelidade concluída!\n')
  client.release()
  pool.end()
}).catch(err => { console.error('Erro:', err.message); process.exit(1) })