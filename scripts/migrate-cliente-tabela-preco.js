// scripts/migrate-cliente-tabela-preco.js
//
// Cria t_cliente.tabela_preco — a tabela de preço padrão de cada cliente.
//
// Valores aceitos (os mesmos de TIPOS_PRECO em lib/constants.ts):
//   varejo | atacado_a | atacado_b | atacado_c | atacado_d | atacado_e
//
// Todo cliente existente nasce em 'varejo', que é exatamente o comportamento
// de hoje — o PDV e as vendas já usam varejo por padrão. Ninguém muda de preço
// por causa desta migration.
//
// Quem consome: PDV e VendaService.resolverPreco(). O tipo escolhido é gravado
// em t_venda_item.tipo_precao, então o histórico registra por qual tabela cada
// item foi vendido.
//
// Idempotente.
//
//   node scripts/migrate-cliente-tabela-preco.js            → simula
//   node scripts/migrate-cliente-tabela-preco.js --apply    → aplica
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

      const { rows: cols } = await client.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = 't_cliente'`,
        [schema]
      )
      if (cols.length === 0) {
        console.log('   t_cliente não existe — pulando')
        continue
      }

      if (cols.some(c => c.column_name === 'tabela_preco')) {
        console.log('   já existe: tabela_preco')
      } else {
        console.log('   criar:     tabela_preco VARCHAR(20) NOT NULL DEFAULT \'varejo\'')
        if (APLICAR) {
          await client.query(`
            ALTER TABLE "${schema}".t_cliente
            ADD COLUMN IF NOT EXISTS tabela_preco VARCHAR(20) NOT NULL DEFAULT 'varejo'
          `)
        }
      }

      if (APLICAR) {
        // Segurança: qualquer valor fora da lista volta para varejo.
        await client.query(`
          UPDATE "${schema}".t_cliente
          SET tabela_preco = 'varejo'
          WHERE tabela_preco IS NULL
             OR tabela_preco NOT IN ('varejo','atacado_a','atacado_b','atacado_c','atacado_d','atacado_e')
        `)

        const { rows: dist } = await client.query(`
          SELECT tabela_preco, COUNT(*)::int AS clientes
          FROM "${schema}".t_cliente
          WHERE active_flg = true
          GROUP BY tabela_preco ORDER BY tabela_preco
        `)
        console.table(dist)
      }
    }

    console.log(APLICAR ? '\nConcluído.' : '\nSimulação concluída. Rode com --apply para gravar.')
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch(err => { console.error(err); process.exit(1) })