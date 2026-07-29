// scripts/migrate-tipo-revenda.js
//
// Limpa a herança do tipo = 'Revenda'.
//
// Antes de existir a coluna própria `revenda`, marcar um produto como revenda
// gravava tipo = 'Revenda'. Depois a coluna foi criada, mas o código manteve o
// fallback "revenda OU tipo='Revenda'" — e com isso a caixa fica travada
// marcada: você desmarca, grava false, recarrega, e o fallback pelo tipo a
// marca de novo.
//
// Este script apaga o tipo legado. A informação de revenda passa a viver só na
// coluna. O tipo real (Massa, Bebida...) você redefine no cadastro.
//
//   node scripts/migrate-tipo-revenda.js              → mostra o que faria
//   node scripts/migrate-tipo-revenda.js --apply      → limpa o tipo
//   node scripts/migrate-tipo-revenda.js --apply --backfill
//        → antes de limpar, marca revenda = true em quem tem tipo = 'Revenda'
//
// ATENÇÃO ao --backfill: use apenas se, no seu banco, tipo='Revenda' ainda for
// a única indicação de revenda. Se você já desmarcou a caixa de propósito em
// algum produto, o backfill vai remarcá-la.
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

const argv     = process.argv.slice(2)
const APLICAR  = argv.includes('--apply')
const BACKFILL = argv.includes('--backfill')

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

async function main() {
  const pool   = new Pool(conexao())
  const client = await pool.connect()

  try {
    const { rows: schemas } = await client.query(`
      SELECT schema_name FROM information_schema.schemata
      WHERE schema_name LIKE 'tenant\\_%' ESCAPE '\\'
      ORDER BY schema_name
    `)

    console.log(`${schemas.length} tenant(s)${APLICAR ? '' : ' — SIMULAÇÃO, nada será gravado'}`)
    if (BACKFILL) console.log('modo --backfill ativo: revenda = true onde tipo = \'Revenda\'')
    console.log('')

    for (const { schema_name: schema } of schemas) {
      const { rows: cols } = await client.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = 't_produto'`,
        [schema]
      )
      if (!cols.some(c => c.column_name === 'revenda')) {
        console.log(`── ${schema}: sem coluna revenda — rode antes a migration que a cria. Pulando.`)
        continue
      }

      const { rows: alvos } = await client.query(
        `SELECT produto_id, nome, tipo, revenda
         FROM "${schema}".t_produto
         WHERE tipo = 'Revenda'
         ORDER BY nome`
      )

      console.log(`── ${schema}: ${alvos.length} produto(s) com tipo = 'Revenda'`)
      for (const p of alvos) {
        console.log(`     #${p.produto_id} ${p.nome}  (revenda atual: ${p.revenda})`)
      }
      if (alvos.length === 0) continue

      if (APLICAR) {
        if (BACKFILL) {
          await client.query(
            `UPDATE "${schema}".t_produto SET revenda = true WHERE tipo = 'Revenda'`
          )
        }
        await client.query(
          `UPDATE "${schema}".t_produto SET tipo = NULL, updated_dt = NOW() WHERE tipo = 'Revenda'`
        )
        console.log('     tipo limpo.')
      }
    }

    console.log(APLICAR ? '\nConcluído.' : '\nSimulação concluída. Rode com --apply para gravar.')
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch(err => { console.error(err); process.exit(1) })