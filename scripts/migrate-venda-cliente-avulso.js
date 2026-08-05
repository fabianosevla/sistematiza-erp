// scripts/migrate-venda-cliente-avulso.js
//
// Acrescenta t_venda.nome_cliente_avulso.
//
// Mesma ideia do campo já criado em t_pedido: quem compra uma vez e não vale
// cadastrar. O nome digitado fica na venda e sai no cupom.
//
// LIMITE, de propósito: esse nome NÃO é um cliente. Sem histórico, sem tabela
// de preço, sem cashback — o programa de fidelidade precisa de cliente_id.
// Quando o avulso virar recorrente, cadastre de verdade.
//
// Idempotente.
//
//   node scripts/migrate-venda-cliente-avulso.js            → simula
//   node scripts/migrate-venda-cliente-avulso.js --apply    → aplica
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

// Tabelas que passam a aceitar nome de cliente avulso.
// t_comanda entra junto: fechar comanda gera venda, e o nome tem que
// atravessar o caminho inteiro sem se perder.
const ALVOS = ['t_venda', 't_comanda']

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

      for (const tabela of ALVOS) {
        const { rows: existeTabela } = await client.query(`
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = $1 AND table_name = $2
        `, [schema, tabela])

        if (existeTabela.length === 0) {
          console.log(`   ${tabela} não existe — pulando`)
          continue
        }

        const { rows } = await client.query(`
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = $1 AND table_name = $2
            AND column_name = 'nome_cliente_avulso'
        `, [schema, tabela])

        if (rows.length > 0) {
          console.log(`   já existe: ${tabela}.nome_cliente_avulso`)
        } else {
          console.log(`   criar:     ${tabela}.nome_cliente_avulso VARCHAR(200)`)
          if (APLICAR) {
            await client.query(
              `ALTER TABLE "${schema}".${tabela} ADD COLUMN IF NOT EXISTS nome_cliente_avulso VARCHAR(200)`
            )
          }
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