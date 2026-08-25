// scripts/migrate-perfil-trib-consumidor-final.js
//
// SEGUNDO PERFIL TRIBUTARIO NO PRODUTO — venda a consumidor final.
//
// t_produto.perfil_trib_id sempre foi o perfil para venda a CONTRIBUINTE
// (NF-e para empresa com CNPJ). Mas NFC-e — e NF-e para CPF — e outra
// operacao para a SEFAZ: CFOP e CSOSN mudam. Usar o mesmo perfil_trib_id
// para as duas coisas emite NFC-e com CFOP/CSOSN de venda a contribuinte,
// que a Focus rejeita.
//
// Este script so cria a coluna. O preenchimento dos produtos e feito a
// parte, por tenant, porque depende de quais perfis existem e formam par.
//
//   node scripts/migrate-perfil-trib-consumidor-final.js            (simula)
//   node scripts/migrate-perfil-trib-consumidor-final.js --aplicar  (grava)
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

const APLICAR = process.argv.includes('--aplicar')
const COLUNA  = 'perfil_trib_consumidor_final_id'
const TIPO    = 'INTEGER'

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

      const existeTabela = await c.query(`SELECT to_regclass('t_produto') IS NOT NULL AS e`)
      if (!existeTabela.rows[0].e) {
        console.log(`${schema}: t_produto nao existe. Pulando.`)
        continue
      }

      const { rows: atuais } = await c.query(`
        SELECT column_name FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = 't_produto'
      `, [schema])

      if (atuais.some(r => r.column_name === COLUNA)) {
        console.log(`${schema}: coluna ja existe.`)
        continue
      }

      if (!APLICAR) {
        console.log(`${schema}: criaria ${COLUNA}.`)
        continue
      }

      await c.query(`ALTER TABLE t_produto ADD COLUMN ${COLUNA} ${TIPO}`)
      console.log(`${schema}: coluna criada.`)
    }

    console.log(APLICAR ? '\nOK.' : '\nNada foi gravado. Rode com --aplicar.')
  } finally {
    c.release()
    await pool.end()
  }
}

main().catch(err => { console.error('\nERRO:', err.message); process.exit(1) })
