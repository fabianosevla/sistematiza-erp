// scripts/migrate-pedido-cliente-avulso.js
//
// Acrescenta t_pedido.nome_cliente_avulso.
//
// Para quem compra uma vez e não vale cadastrar. O nome digitado fica no
// pedido e acompanha a conta a receber gerada na entrega.
//
// LIMITE, de propósito: esse nome NÃO é um cliente. Não tem histórico, não
// tem tabela de preço, e a conta a receber nasce sem cliente_id — então
// "quanto o João me deve" não é uma pergunta respondível para ele. Quando o
// avulso virar recorrente, cadastre de verdade.
//
// Idempotente.
//
//   node scripts/migrate-pedido-cliente-avulso.js            → simula
//   node scripts/migrate-pedido-cliente-avulso.js --apply    → aplica
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

      const { rows } = await client.query(`
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 't_pedido'
          AND column_name = 'nome_cliente_avulso'
      `, [schema])

      if (rows.length > 0) {
        console.log('   já existe: nome_cliente_avulso')
      } else {
        console.log('   criar:     nome_cliente_avulso VARCHAR(200)')
        if (APLICAR) {
          await client.query(
            `ALTER TABLE "${schema}".t_pedido ADD COLUMN IF NOT EXISTS nome_cliente_avulso VARCHAR(200)`
          )
        }
      }
      console.log('')
    }

    console.log(APLICAR ? 'Concluído.' : 'Simulação concluída. Rode com --apply para gravar.')
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch(err => { console.error(err); process.exit(1) })