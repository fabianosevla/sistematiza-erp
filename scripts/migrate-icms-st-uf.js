/**
 * Migration: MVA/ICMS-ST por estado de destino
 *
 * Hoje cada perfil tributário tem UM mva e UMA alíquota de ICMS-ST fixos,
 * usados pra qualquer venda interestadual. Mas MVA e alíquota de ST são
 * definidos por protocolo/convênio ESTADUAL — variam de UF pra UF, e mudam
 * ao longo do tempo por portaria. Um valor fixo só está certo por acaso.
 *
 * Esta tabela permite cadastrar um MVA/alíquota específico por (perfil,
 * estado de destino). Quando a venda for pra um estado sem linha
 * cadastrada aqui, o sistema cai no valor padrão do perfil (mva/aliq_icms_st
 * de t_perfil_tributario) — comportamento de hoje, preservado como
 * fallback. Ou seja: não migra nada pra ninguém, só abre a possibilidade de
 * refinar por estado quando alguém souber o valor certo.
 *
 * `fonte` guarda de onde veio o número (data + referência), porque MVA muda
 * por portaria e um valor sem data é um valor que ninguém sabe se ainda vale.
 *
 * Idempotente: usa IF NOT EXISTS, pode rodar quantas vezes precisar.
 *
 * Rodar: node scripts/migrate-icms-st-uf.js
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

  await client.query(`
    CREATE TABLE IF NOT EXISTS t_icms_st_uf (
      icms_st_uf_id     SERIAL PRIMARY KEY,
      modification_num  INTEGER      NOT NULL DEFAULT 0,
      created_dt        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      created_by        INTEGER      NOT NULL DEFAULT 1,
      updated_dt        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_by        INTEGER      NOT NULL DEFAULT 1,
      active_flg        BOOLEAN      NOT NULL DEFAULT TRUE,

      perfil_trib_id    INTEGER      NOT NULL REFERENCES t_perfil_tributario(perfil_trib_id),
      uf_destino        VARCHAR(2)   NOT NULL,
      mva               NUMERIC(6,2) NOT NULL DEFAULT 0,
      aliq_icms_st      NUMERIC(5,2) NOT NULL DEFAULT 0,
      fonte             VARCHAR(300),
      observacao        VARCHAR(500)
    )
  `)
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS ux_icms_st_uf_perfil_uf
      ON t_icms_st_uf (perfil_trib_id, uf_destino) WHERE active_flg = true
  `)
}

pool.connect().then(async client => {
  const res = await client.query(`
    SELECT schema_name FROM information_schema.schemata
    WHERE schema_name LIKE 'tenant_%'
    ORDER BY schema_name
  `)
  const schemas = res.rows.map(r => r.schema_name)
  console.log(`\nICMS-ST por estado: migrando ${schemas.length} schema(s) de tenant...\n`)

  for (const schema of schemas) {
    try {
      await migrarSchema(client, schema)
      console.log(`  ✓ ${schema}`)
    } catch (e) {
      console.error(`  ✗ ${schema}: ${e.message}`)
    }
  }

  console.log('\n✅ Migration de ICMS-ST por estado concluída!\n')
  client.release()
  pool.end()
}).catch(err => { console.error('Erro:', err.message); process.exit(1) })
