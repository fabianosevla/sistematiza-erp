// scripts/migrate-conta-receber-ajustes.js
//
// Cria valor_base, desconto e acrescimo em t_conta_receber.
//
// O valor total da conta deixou de ser digitado à mão. Ele passa a ser
// calculado:
//
//   valor_original = valor_base - desconto + acrescimo
//
// valor_base é o valor cru — a soma dos itens do pedido, ou o que foi digitado
// numa conta manual. valor_original continua sendo o que o cliente deve, e
// segue como referência de tudo que já existia: KPIs, status, comparação com
// valor_recebido e o total da venda gerada na baixa.
//
// Editar o total diretamente permitia mudar o valor da cobrança sem deixar
// registro do porquê. Com desconto e acréscimo separados, o motivo do ajuste
// fica gravado.
//
// A migração é conservadora: valor_base recebe o valor_original atual, e os
// ajustes começam zerados. Nenhuma conta muda de valor.
//
//   node scripts/migrate-conta-receber-ajustes.js            (simula)
//   node scripts/migrate-conta-receber-ajustes.js --aplicar  (grava)
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

const APLICAR = process.argv.includes('--aplicar')

const COLUNAS = [
  ['valor_base', 'INTEGER'],
  ['desconto',   'INTEGER NOT NULL DEFAULT 0'],
  ['acrescimo',  'INTEGER NOT NULL DEFAULT 0'],
]

function conexao() {
  if (process.env.DATABASE_URL) return { connectionString: process.env.DATABASE_URL }
  const host = process.env.DB_HOST
  if (!host) throw new Error('Defina DATABASE_URL ou DB_HOST/... no .env.local')
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

async function main() {
  const pool = new Pool(conexao())
  const c    = await pool.connect()

  try {
    const { rows: schemas } = await c.query(`
      SELECT schema_name FROM information_schema.schemata
      WHERE schema_name LIKE 'tenant\\_%' ESCAPE '\\' ORDER BY schema_name
    `)

    console.log(APLICAR ? '\n>>> MODO GRAVACAO\n' : '\n>>> SIMULACAO — nada sera gravado. Use --aplicar.\n')

    for (const { schema_name: schema } of schemas) {
      console.log(`\n${'='.repeat(66)}\n${schema}\n${'='.repeat(66)}`)
      await c.query(`SET search_path TO "${schema}", public`)

      const existe = await c.query(`SELECT to_regclass('t_conta_receber') IS NOT NULL AS existe`)
      if (!existe.rows[0].existe) {
        console.log('  t_conta_receber nao existe neste schema. Pulando.')
        continue
      }

      const { rows: atuais } = await c.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 't_conta_receber'
      `, [schema])
      const jaTem = new Set(atuais.map(r => r.column_name))

      for (const [nome, tipo] of COLUNAS) {
        if (jaTem.has(nome)) {
          console.log(`  ${nome}: ja existe.`)
        } else if (!APLICAR) {
          console.log(`  ${nome}: criaria ${tipo}.`)
        } else {
          await c.query(`ALTER TABLE t_conta_receber ADD COLUMN ${nome} ${tipo}`)
          console.log(`  ${nome}: criada.`)
        }
      }

      if (!APLICAR) {
        const { rows } = await c.query(`
          SELECT COUNT(*)::int AS n FROM t_conta_receber WHERE active_flg = true
        `)
        console.log(`\n  ${rows[0].n} conta(s) receberiam valor_base = valor_original.`)
        continue
      }

      const upd = await c.query(`
        UPDATE t_conta_receber
           SET valor_base = valor_original
         WHERE valor_base IS NULL
      `)
      console.log(`\n  ${upd.rowCount} conta(s) com valor_base preenchido.`)
      console.log('  Nenhum valor de cobranca foi alterado.')
    }
  } finally {
    c.release()
    await pool.end()
  }
}

main().catch(err => { console.error('\nERRO:', err.message); process.exit(1) })
