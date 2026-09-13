/**
 * Migration: módulo CRM (13/09/2026)
 * Cria 3 tabelas em CADA schema de tenant (tenant_%):
 *   - t_crm_lead             (funil B2B de prospecção — mercado/restaurante)
 *   - t_cardapio_evento      (funil do cardápio digital: visualização/pedido montado)
 *   - t_crm_campanha_envio   (log de envio de campanha em massa por WhatsApp)
 *
 * Também adiciona:
 *   - t_pedido.origem            (mesma ideia de t_venda.origem, mas no pedido —
 *                                  é ali que a venda vinda do cardápio é lançada)
 *   - t_configuracoes_tenant.crm_ativo   (módulo pago, default FALSE)
 *   - t_perfil_acesso.modulo_crm         (permissão por perfil, default FALSE)
 *
 * Fidelidade (t_fidelidade_*) não muda em nada aqui — continua com sua
 * própria migração (scripts/migrate-fidelidade.js). O CRM só passa a
 * mostrá-la como aba.
 *
 * Idempotente: usa IF NOT EXISTS, pode rodar quantas vezes precisar.
 *
 * Rodar: node scripts/migrate-crm.js
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

  // ── Funil B2B ─────────────────────────────────────────────────────────────
  await client.query(`
    CREATE TABLE IF NOT EXISTS t_crm_lead (
      lead_id                  SERIAL PRIMARY KEY,
      modification_num         INTEGER      NOT NULL DEFAULT 0,
      created_dt                TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      created_by                INTEGER      NOT NULL DEFAULT 1,
      updated_dt                TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_by                INTEGER      NOT NULL DEFAULT 1,
      active_flg                BOOLEAN      NOT NULL DEFAULT TRUE,

      nome_empresa               VARCHAR(200) NOT NULL,
      contato_nome                VARCHAR(100),
      telefone                    VARCHAR(20),
      email                        VARCHAR(150),
      cliente_id                   INTEGER,
      origem                       VARCHAR(30)  NOT NULL DEFAULT 'prospeccao',
      estagio                      VARCHAR(20)  NOT NULL DEFAULT 'novo', -- novo|contatado|negociando|proposta|ganho|perdido
      valor_estimado_centavos     INTEGER      NOT NULL DEFAULT 0,
      motivo_perda                VARCHAR(200),
      responsavel                 VARCHAR(100),
      proxima_acao_data           DATE,
      observacao                  TEXT,
      ganho_em                    TIMESTAMPTZ,
      perdido_em                  TIMESTAMPTZ
    )
  `)
  await client.query(`CREATE INDEX IF NOT EXISTS ix_crm_lead_estagio ON t_crm_lead (estagio)`)
  await client.query(`CREATE INDEX IF NOT EXISTS ix_crm_lead_cliente ON t_crm_lead (cliente_id)`)

  // ── Funil do cardápio digital ───────────────────────────────────────────────
  await client.query(`
    CREATE TABLE IF NOT EXISTS t_cardapio_evento (
      evento_id          SERIAL PRIMARY KEY,
      modification_num   INTEGER      NOT NULL DEFAULT 0,
      created_dt          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      created_by          INTEGER      NOT NULL DEFAULT 1,
      updated_dt          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_by          INTEGER      NOT NULL DEFAULT 1,
      active_flg          BOOLEAN      NOT NULL DEFAULT TRUE,

      tipo                 VARCHAR(20)  NOT NULL, -- visualizacao | pedido_montado
      ip_hash               VARCHAR(64),
      ocorrido_em           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `)
  await client.query(`CREATE INDEX IF NOT EXISTS ix_cardapio_evento_data ON t_cardapio_evento (ocorrido_em)`)
  await client.query(`CREATE INDEX IF NOT EXISTS ix_cardapio_evento_tipo ON t_cardapio_evento (tipo)`)

  // ── Log de envio de campanha ────────────────────────────────────────────────
  await client.query(`
    CREATE TABLE IF NOT EXISTS t_crm_campanha_envio (
      envio_id            SERIAL PRIMARY KEY,
      modification_num    INTEGER      NOT NULL DEFAULT 0,
      created_dt           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      created_by           INTEGER      NOT NULL DEFAULT 1,
      updated_dt           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_by           INTEGER      NOT NULL DEFAULT 1,
      active_flg           BOOLEAN      NOT NULL DEFAULT TRUE,

      cliente_id            INTEGER      NOT NULL,
      campanha_nome         VARCHAR(150) NOT NULL,
      enviado_em            TIMESTAMPTZ,
      status                VARCHAR(20)  NOT NULL DEFAULT 'enviado', -- enviado | erro
      erro_msg              VARCHAR(500),
      wa_message_id         VARCHAR(150)
    )
  `)
  await client.query(`CREATE INDEX IF NOT EXISTS ix_crm_campanha_cliente ON t_crm_campanha_envio (cliente_id)`)

  // ── Origem do pedido — é onde a venda vinda do cardápio é lançada à mão ────
  await client.query(`ALTER TABLE t_pedido ADD COLUMN IF NOT EXISTS origem VARCHAR(20) NOT NULL DEFAULT 'direta'`)

  // ── Integração com o menu / configurações / perfis ────────────────────────
  await client.query(`ALTER TABLE t_configuracoes_tenant ADD COLUMN IF NOT EXISTS crm_ativo BOOLEAN NOT NULL DEFAULT FALSE`)
  await client.query(`ALTER TABLE t_perfil_acesso ADD COLUMN IF NOT EXISTS modulo_crm BOOLEAN NOT NULL DEFAULT FALSE`)
}

pool.connect().then(async client => {
  const res = await client.query(`
    SELECT schema_name FROM information_schema.schemata
    WHERE schema_name LIKE 'tenant_%'
    ORDER BY schema_name
  `)
  const schemas = res.rows.map(r => r.schema_name)
  console.log(`\nCRM: migrando ${schemas.length} schema(s) de tenant...\n`)

  for (const schema of schemas) {
    try {
      await migrarSchema(client, schema)
      console.log(`  ✓ ${schema}`)
    } catch (e) {
      console.error(`  ✗ ${schema}: ${e.message}`)
    }
  }

  console.log('\n✅ Migration de CRM concluída!\n')
  client.release()
  pool.end()
}).catch(err => { console.error('Erro:', err.message); process.exit(1) })
