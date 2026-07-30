// scripts/migrate-insumo-tipo.js
//
// Tampa a origem do problema "MP" vs "Matéria Prima".
//
// t_insumo.tipo era VARCHAR(20) NOT NULL DEFAULT 'MP'. Duas consequências:
//   1. todo registro criado sem tipo explícito nascia 'MP' — foi assim que os
//      51 insumos importados ficaram fora do padrão;
//   2. com 20 caracteres, um valor de domínio mais longo seria cortado no meio.
//
// Este script alinha a coluna ao mesmo formato do tipo de produto:
// VARCHAR(100) e default por extenso.
//
// Rode DEPOIS de scripts/normalizar-dominios.js --apply, senão o default novo
// convive com os 'MP' antigos.
//
// Idempotente.
//
//   node scripts/migrate-insumo-tipo.js            → simula
//   node scripts/migrate-insumo-tipo.js --apply    → aplica
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

const APLICAR = process.argv.includes('--apply')
const NOVO_DEFAULT = 'Matéria Prima'
const NOVO_TAMANHO = 100

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

      const { rows: col } = await client.query(`
        SELECT character_maximum_length AS tamanho, column_default AS padrao, is_nullable
        FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 't_insumo' AND column_name = 'tipo'
      `, [schema])

      if (col.length === 0) {
        console.log('   t_insumo.tipo não existe — pulando')
        continue
      }

      const atual = col[0]
      console.log(`   atual: varchar(${atual.tamanho}) default ${atual.padrao ?? '(nenhum)'}`)

      const precisaTamanho = Number(atual.tamanho) < NOVO_TAMANHO
      const precisaDefault = !String(atual.padrao ?? '').includes(NOVO_DEFAULT)

      if (!precisaTamanho && !precisaDefault) {
        console.log('   já está no formato novo')
        continue
      }

      if (precisaTamanho) console.log(`   alterar: varchar(${atual.tamanho}) → varchar(${NOVO_TAMANHO})`)
      if (precisaDefault) console.log(`   alterar: default → '${NOVO_DEFAULT}'`)

      if (APLICAR) {
        if (precisaTamanho) {
          await client.query(`
            ALTER TABLE "${schema}".t_insumo
            ALTER COLUMN tipo TYPE VARCHAR(${NOVO_TAMANHO})
          `)
        }
        if (precisaDefault) {
          await client.query(`
            ALTER TABLE "${schema}".t_insumo
            ALTER COLUMN tipo SET DEFAULT '${NOVO_DEFAULT}'
          `)
        }
        console.log('   aplicado.')
      }

      // Conferência: valores em uso depois da mudança
      const { rows: dist } = await client.query(`
        SELECT tipo, COUNT(*)::int AS insumos
        FROM "${schema}".t_insumo
        WHERE active_flg = true
        GROUP BY tipo ORDER BY insumos DESC
      `)
      console.table(dist)
    }

    console.log(APLICAR ? '\nConcluído.' : '\nSimulação concluída. Rode com --apply para gravar.')
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch(err => { console.error(err); process.exit(1) })