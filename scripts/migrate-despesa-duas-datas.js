// scripts/migrate-despesa-duas-datas.js
//
// DESPESA PASSA A TER DUAS DATAS.
//
// Cartao QA #84. Comprar e pagar sao momentos diferentes, e o DRE tem que
// seguir o SEGUNDO. Compra no cartao de credito em agosto, fatura paga em
// setembro: o dinheiro sai em setembro, e e em setembro que a despesa pesa.
//
// ─── O QUE MUDA ─────────────────────────────────────────────────────────────
//
//   data_despesa    passa a significar DATA DA COMPRA (o nome fica, para nao
//                   quebrar as dezenas de lugares que ja a leem)
//   data_pagamento  NOVA — quando o dinheiro sai. Vazia = a vista.
//
// A competencia (mes_competencia / ano_competencia), que e por onde o DRE
// agrupa, passa a ser derivada de data_pagamento; sem ela, da data da compra.
//
// ─── O BUG QUE ISSO CORRIGE ─────────────────────────────────────────────────
//
// A tela mandava `mes` e `ano` do FILTRO DE PERIODO junto com o cadastro, e o
// servico dava prioridade a eles:
//
//   const mes = payload.mes ?? dt.getMonth() + 1
//
// Resultado: lancar uma despesa com data 01/09 enquanto se olhava agosto
// gravava competencia agosto. A data digitada era ignorada.
//
// ─── BACKFILL ───────────────────────────────────────────────────────────────
//
// Despesa que ja existe nao tem como saber se foi paga em outro mes. Todas
// recebem data_pagamento = data_despesa, que e a leitura honesta: ate hoje o
// sistema so sabia registrar despesa a vista.
//
//   node scripts/migrate-despesa-duas-datas.js            (simula)
//   node scripts/migrate-despesa-duas-datas.js --aplicar  (grava)
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

const APLICAR = process.argv.includes('--aplicar')

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

      const existe = await c.query(`SELECT to_regclass('t_despesa') IS NOT NULL AS e`)
      if (!existe.rows[0].e) { console.log('  t_despesa nao existe. Pulando.'); continue }

      const { rows: cols } = await c.query(`
        SELECT column_name FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = 't_despesa'
      `, [schema])
      const tem = new Set(cols.map(r => r.column_name))

      if (tem.has('data_pagamento')) {
        console.log('  data_pagamento: ja existe.')
      } else if (!APLICAR) {
        console.log('  data_pagamento: seria criada.')
      } else {
        await c.query(`ALTER TABLE t_despesa ADD COLUMN data_pagamento TIMESTAMPTZ`)
        console.log('  data_pagamento: criada.')
      }

      // Backfill: tudo que existe hoje foi lancado como a vista.
      const { rows: pend } = await c.query(
        tem.has('data_pagamento')
          ? `SELECT COUNT(*)::int AS n FROM t_despesa WHERE active_flg = true AND data_pagamento IS NULL`
          : `SELECT COUNT(*)::int AS n FROM t_despesa WHERE active_flg = true`
      ).catch(() => ({ rows: [{ n: 0 }] }))
      const n = pend[0]?.n ?? 0

      if (n === 0) {
        console.log('  backfill: nada a preencher.')
      } else if (!APLICAR) {
        console.log(`  backfill: ${n} despesa(s) receberiam data_pagamento = data_despesa.`)
      } else {
        await c.query(`
          UPDATE t_despesa SET data_pagamento = data_despesa
           WHERE active_flg = true AND data_pagamento IS NULL
        `)
        console.log(`  backfill: ${n} despesa(s) atualizada(s).`)
      }

      // Diagnostico: quantas tem competencia divergente da data. Sao as que
      // foram gravadas com o mes do filtro da tela em vez da data digitada.
      if (tem.has('mes_competencia')) {
        const { rows: div } = await c.query(`
          SELECT COUNT(*)::int AS n FROM t_despesa
           WHERE active_flg = true
             AND (mes_competencia <> EXTRACT(MONTH FROM data_despesa)::int
              OR  ano_competencia <> EXTRACT(YEAR  FROM data_despesa)::int)
        `).catch(() => ({ rows: [{ n: 0 }] }))
        const d = div[0]?.n ?? 0
        if (d > 0) {
          console.log(`\n  ATENCAO: ${d} despesa(s) com competencia diferente da data da compra.`)
          console.log('  Provavelmente foram gravadas com o mes que estava aberto na tela.')
          console.log('  NAO sao corrigidas automaticamente: pode haver caso legitimo')
          console.log('  (recorrente, fatura de cartao). Confira uma a uma em Financeiro.')
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
