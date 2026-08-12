// scripts/migrate-cardapio.js
//
// CARDÁPIO DIGITAL PÚBLICO — piloto Zaghi.
//
// Três colunas novas:
//   t_produto              → foto_url, disponivel_cardapio
//   t_pedido                → forma_pagamento_id (forma de pagamento
//                              declarada pelo cliente no cardápio)
//   t_configuracoes_tenant  → cardapio_ativo (liga/desliga o link público)
//
// cardapio_ativo nasce FALSE em todo mundo — a rota pública checa essa flag
// antes de mostrar qualquer coisa. Só a Zaghi é ligada no fim deste script,
// porque é o piloto: ver docs/backlog.md.
//
//   node scripts/migrate-cardapio.js            (simula)
//   node scripts/migrate-cardapio.js --aplicar  (grava)
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

const APLICAR = process.argv.includes('--aplicar')
const SCHEMA_PILOTO = 'tenant_zaghi_massas_caseiras'

const COLUNAS = {
  t_produto: [
    ['foto_url',            'VARCHAR(500)'],
    ['disponivel_cardapio', 'BOOLEAN NOT NULL DEFAULT FALSE'],
  ],
  t_pedido: [
    ['forma_pagamento_id', 'INTEGER'],
  ],
  t_configuracoes_tenant: [
    ['cardapio_ativo', 'BOOLEAN NOT NULL DEFAULT FALSE'],
  ],
}

function conexao() {
  if (process.env.DATABASE_URL) return { connectionString: process.env.DATABASE_URL }
  const host = process.env.DB_HOST
  if (!host) throw new Error('Defina DATABASE_URL ou DB_HOST/... no .env.local')
  const local = /^(localhost|127\.0\.0\.1)$/.test(host)
  return {
    host, port: Number(process.env.DB_PORT ?? 5432),
    database: process.env.DB_NAME, user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: local ? false : { rejectUnauthorized: false },
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

      for (const [tabela, colunas] of Object.entries(COLUNAS)) {
        const existe = await c.query(`SELECT to_regclass($1) IS NOT NULL AS e`, [tabela])
        if (!existe.rows[0].e) { console.log(`  ${tabela}: nao existe. Pulando.`); continue }

        const { rows: atuais } = await c.query(`
          SELECT column_name FROM information_schema.columns
           WHERE table_schema = $1 AND table_name = $2
        `, [schema, tabela])
        const jaTem = new Set(atuais.map(r => r.column_name))
        const faltando = colunas.filter(([n]) => !jaTem.has(n))

        if (faltando.length === 0) { console.log(`  ${tabela}: completa.`); continue }
        if (!APLICAR) { console.log(`  ${tabela}: criaria ${faltando.map(([n]) => n).join(', ')}`); continue }

        for (const [nome, tipo] of faltando) {
          await c.query(`ALTER TABLE "${tabela}" ADD COLUMN ${nome} ${tipo}`)
        }
        console.log(`  ${tabela}: ${faltando.length} coluna(s) criada(s).`)
      }

      if (schema === SCHEMA_PILOTO) {
        if (!APLICAR) {
          console.log(`  cardapio_ativo: ligaria para ${SCHEMA_PILOTO} (piloto).`)
        } else {
          await c.query(`UPDATE t_configuracoes_tenant SET cardapio_ativo = TRUE`)
          console.log(`  cardapio_ativo: ligado para ${SCHEMA_PILOTO} (piloto).`)
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
