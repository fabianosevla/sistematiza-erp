// scripts/migrate-turno-caixa.js
//
// TURNO DE CAIXA GANHA CHAVE PROPRIA.
//
// O turno existia so dentro do modulo fiscal, e a tela dizia "abra o turno de
// caixa para emitir NFC-e". Duas coisas erradas nisso:
//
//   1. NFC-e nao exige turno de caixa. Isso e regra de negocio, nao da lei.
//   2. O PDV — onde as vendas acontecem — nao sabia que turno existia.
//      Havia duas nocoes de caixa desconectadas.
//
// Turno de caixa e controle GERENCIAL: abrir com um valor, vender, fechar
// conferindo. Padaria sem NFC-e pode querer; fabrica com NFC-e pode nao querer.
// Por isso chave propria, e nao carona no fiscal_ativo.
//
// NASCE DESLIGADA. Quem opera hoje sem turno continua vendendo sem turno.
// Ligar e decisao de quem quer o controle.
//
//   node scripts/migrate-turno-caixa.js            (simula)
//   node scripts/migrate-turno-caixa.js --aplicar  (grava)
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

const APLICAR = process.argv.includes('--aplicar')

const COLUNAS = [
  ['turno_caixa_ativo', 'BOOLEAN NOT NULL DEFAULT FALSE'],
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
      console.log(`\n${schema}`)
      await c.query(`SET search_path TO "${schema}", public`)

      const existe = await c.query(`SELECT to_regclass('t_configuracoes_tenant') IS NOT NULL AS e`)
      if (!existe.rows[0].e) { console.log('  sem t_configuracoes_tenant. Pulando.'); continue }

      const { rows: atuais } = await c.query(`
        SELECT column_name FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = 't_configuracoes_tenant'
      `, [schema])
      const jaTem = new Set(atuais.map(r => r.column_name))

      for (const [nome, tipo] of COLUNAS) {
        if (jaTem.has(nome))      console.log(`  ${nome}: ja existe.`)
        else if (!APLICAR)        console.log(`  ${nome}: criaria ${tipo}.`)
        else {
          await c.query(`ALTER TABLE t_configuracoes_tenant ADD COLUMN ${nome} ${tipo}`)
          console.log(`  ${nome}: criada, desligada.`)
        }
      }
    }
    console.log(APLICAR ? '\nOK.' : '\nNada gravado. Rode com --aplicar.')
  } finally {
    c.release()
    await pool.end()
  }
}
main().catch(e => { console.error('\nERRO:', e.message); process.exit(1) })
