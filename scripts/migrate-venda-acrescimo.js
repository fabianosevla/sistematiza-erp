// scripts/migrate-venda-acrescimo.js
//
// COLUNA NOVA: t_venda.acrescimo.
//
// `desconto` sempre guardou o líquido (desconto real − acréscimo real) — é
// o que o total da venda e a nota fiscal usam pra fechar a conta, e não
// muda. O problema era só na 2ª via do cupom: sem o acréscimo real
// separado, uma venda com desconto E acréscimo juntos não tinha como
// reconstruir os dois valores originais, só a diferença entre eles.
//
// Esta coluna guarda o acréscimo real, à parte. Não participa de nenhum
// cálculo de total ou de nota fiscal — é só para a 2ª via mostrar certo.
//
//   node scripts/migrate-venda-acrescimo.js            (simula)
//   node scripts/migrate-venda-acrescimo.js --aplicar  (grava)
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

const APLICAR = process.argv.includes('--aplicar')
const COLUNA  = 'acrescimo'
const TIPO    = 'INTEGER NOT NULL DEFAULT 0'

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
      await c.query(`SET search_path TO "${schema}", public`)

      const existeTabela = await c.query(`SELECT to_regclass('t_venda') IS NOT NULL AS e`)
      if (!existeTabela.rows[0].e) {
        console.log(`${schema}: t_venda nao existe. Pulando.`)
        continue
      }

      const { rows: atuais } = await c.query(`
        SELECT column_name FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = 't_venda'
      `, [schema])

      if (atuais.some(r => r.column_name === COLUNA)) {
        console.log(`${schema}: coluna ja existe.`)
        continue
      }

      if (!APLICAR) {
        console.log(`${schema}: criaria ${COLUNA}.`)
        continue
      }

      await c.query(`ALTER TABLE t_venda ADD COLUMN ${COLUNA} ${TIPO}`)
      console.log(`${schema}: coluna criada.`)
    }

    console.log(APLICAR ? '\nOK.' : '\nNada foi gravado. Rode com --aplicar.')
  } finally {
    c.release()
    await pool.end()
  }
}

main().catch(err => { console.error('\nERRO:', err.message); process.exit(1) })
