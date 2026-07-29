// scripts/migrate-producao-registro.js
//
// Duas mudanças de schema, em todos os tenants:
//
// 1. t_movimentacao_estoque.quantidade: INTEGER → NUMERIC(12,3)
//    A coluna era inteira, e a rota /estoque/movimentar fazia Math.round().
//    Movimentar 0,5 kg de um insumo virava 1. Com NUMERIC(12,3) o histórico
//    passa a registrar a quantidade real. Produto continua sendo contado em
//    unidades inteiras na prática — nada muda para ele.
//
// 2. t_producao_registro (nova)
//    Histórico de produção que hoje não existe: guarda o que foi planejado na
//    grade (PP) e o que de fato saiu. É o que permite marcar a célula como
//    realizada, calcular rendimento e auditar por que o estoque mudou.
//
//    Regra de consumo: o insumo é debitado pela quantidade PLANEJADA — é o que
//    realmente saiu da prateleira. O excedente vira rendimento.
//
// Idempotente: pode rodar quantas vezes quiser.
//
//   node scripts/migrate-producao-registro.js            → simula
//   node scripts/migrate-producao-registro.js --apply    → aplica
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

const APLICAR = process.argv.includes('--apply')

function conexao() {
  if (process.env.DATABASE_URL) return { connectionString: process.env.DATABASE_URL }
  const host = process.env.DB_HOST
  if (!host) throw new Error('Defina DATABASE_URL ou DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD no .env.local')
  const local = /^(localhost|127\.0\.0\.1)$/.test(host)
  return {
    host,
    port:     Number(process.env.DB_PORT ?? 5432),
    database: process.env.DB_NAME,
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl:      local ? false : { rejectUnauthorized: false },
  }
}

const DDL_REGISTRO = (schema) => `
  CREATE TABLE IF NOT EXISTS "${schema}".t_producao_registro (
    registro_id       SERIAL PRIMARY KEY,
    modification_num  INTEGER       NOT NULL DEFAULT 0,
    created_dt        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    created_by        INTEGER       NOT NULL DEFAULT 1,
    updated_dt        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_by        INTEGER       NOT NULL DEFAULT 1,
    active_flg        BOOLEAN       NOT NULL DEFAULT true,

    produto_id        INTEGER       NOT NULL,
    data_producao     DATE          NOT NULL,
    -- quantidade que estava na grade (PP) no momento do registro
    qtd_planejada     NUMERIC(12,3) NOT NULL DEFAULT 0,
    -- quantidade que de fato saiu — é ela que entra no estoque
    qtd_produzida     NUMERIC(12,3) NOT NULL,
    -- base usada para debitar insumo: 'planejada' ou 'produzida'
    base_consumo      VARCHAR(20)   NOT NULL DEFAULT 'planejada',
    -- itens debitados, como ficaram no momento (auditoria)
    itens_json        JSONB,
    observacao        VARCHAR(300)
  )
`

async function main() {
  const pool   = new Pool(conexao())
  const client = await pool.connect()

  try {
    const { rows: schemas } = await client.query(`
      SELECT schema_name FROM information_schema.schemata
      WHERE schema_name LIKE 'tenant\\_%' ESCAPE '\\'
      ORDER BY schema_name
    `)

    console.log(`${schemas.length} tenant(s)${APLICAR ? '' : ' — SIMULAÇÃO, nada será gravado'}\n`)

    for (const { schema_name: schema } of schemas) {
      console.log(`── ${schema}`)

      // 1. quantidade → NUMERIC
      const { rows: col } = await client.query(
        `SELECT data_type FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = 't_movimentacao_estoque' AND column_name = 'quantidade'`,
        [schema]
      )
      if (col.length === 0) {
        console.log('   t_movimentacao_estoque não existe — pulando a coluna')
      } else if (col[0].data_type === 'numeric') {
        console.log('   quantidade já é NUMERIC')
      } else {
        console.log(`   alterar: quantidade ${col[0].data_type} → NUMERIC(12,3)`)
        if (APLICAR) {
          await client.query(`
            ALTER TABLE "${schema}".t_movimentacao_estoque
            ALTER COLUMN quantidade TYPE NUMERIC(12,3) USING quantidade::numeric
          `)
        }
      }

      // 2. t_producao_registro
      const { rows: tab } = await client.query(
        `SELECT 1 FROM information_schema.tables
         WHERE table_schema = $1 AND table_name = 't_producao_registro'`,
        [schema]
      )
      if (tab.length > 0) {
        console.log('   t_producao_registro já existe')
      } else {
        console.log('   criar:   t_producao_registro')
        if (APLICAR) {
          await client.query(DDL_REGISTRO(schema))
          await client.query(`
            CREATE INDEX IF NOT EXISTS ix_producao_registro_produto_data
            ON "${schema}".t_producao_registro (produto_id, data_producao)
          `)
        }
      }
    }

    console.log(APLICAR ? '\nConcluído.' : '\nSimulação concluída. Rode com --apply para gravar.')
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch(err => { console.error(err); process.exit(1) })