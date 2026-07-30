// scripts/fix-sequences.js
//
// Ressincroniza as sequências (serial) de todas as tabelas dos tenants.
//
// PROBLEMA QUE ISTO RESOLVE
// Quando linhas são inseridas com id explícito — típico de script de carga
// inicial ou de restauração de backup — a sequência do serial NÃO avança. Ela
// continua apontando para um número baixo, já ocupado. No primeiro INSERT
// normal o banco tenta reusar esse id, bate na chave primária e devolve o erro
// 23505 (violação de chave única).
//
// Como lib/api/responses.ts traduz 23505 para "Já existe um registro com este
// nome", o sintoma aparece como nome duplicado — em qualquer nome, inclusive
// num que nunca foi usado. Foi o que aconteceu ao criar a categoria de gasto
// fixo "Despesas Bancárias".
//
// O script compara, para cada sequência, o último valor com o maior id
// existente na coluna, e corrige o que estiver atrasado.
//
//   node scripts/fix-sequences.js            → mostra o que faria
//   node scripts/fix-sequences.js --apply    → corrige
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

    let totalDefasadas = 0

    for (const { schema_name: schema } of schemas) {
      console.log(`── ${schema}`)

      // Toda coluna que tem uma sequência associada (serial / identity)
      const { rows: colunas } = await client.query(`
        SELECT c.table_name, c.column_name,
               pg_get_serial_sequence(quote_ident($1) || '.' || quote_ident(c.table_name), c.column_name) AS seq
        FROM information_schema.columns c
        WHERE c.table_schema = $1
          AND pg_get_serial_sequence(quote_ident($1) || '.' || quote_ident(c.table_name), c.column_name) IS NOT NULL
        ORDER BY c.table_name
      `, [schema])

      if (colunas.length === 0) {
        console.log('   nenhuma sequência encontrada')
        continue
      }

      const problemas = []

      for (const col of colunas) {
        const { rows: [info] } = await client.query(`
          SELECT
            (SELECT COALESCE(MAX(${col.column_name}), 0) FROM "${schema}"."${col.table_name}") AS maior_id,
            (SELECT last_value FROM ${col.seq})                                                AS sequencia,
            (SELECT is_called FROM ${col.seq})                                                 AS ja_usada
        `)

        const maior = Number(info.maior_id)
        const seq   = Number(info.sequencia)
        // Próximo id que a sequência vai entregar
        const proximo = info.ja_usada ? seq + 1 : seq

        if (proximo <= maior) {
          problemas.push({
            tabela:   col.table_name,
            coluna:   col.column_name,
            maior_id: maior,
            proximo:  proximo,
            situacao: 'DEFASADA — o próximo INSERT falha com 23505',
          })
          totalDefasadas++
          if (APLICAR) {
            await client.query(`SELECT setval('${col.seq}', ${maior}, true)`)
          }
        }
      }

      if (problemas.length === 0) {
        console.log(`   ${colunas.length} sequência(s), todas em dia`)
      } else {
        console.log(`   ${problemas.length} de ${colunas.length} sequência(s) defasada(s):`)
        console.table(problemas)
        if (APLICAR) console.log('   corrigidas.')
      }
    }

    console.log('')
    if (totalDefasadas === 0) {
      console.log('Nenhuma sequência defasada. O erro tem outra causa.')
    } else if (APLICAR) {
      console.log(`${totalDefasadas} sequência(s) corrigida(s). Teste criar o registro de novo.`)
    } else {
      console.log(`${totalDefasadas} sequência(s) defasada(s). Rode com --apply para corrigir.`)
    }
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch(err => { console.error(err); process.exit(1) })