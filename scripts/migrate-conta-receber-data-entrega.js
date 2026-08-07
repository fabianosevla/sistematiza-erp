// scripts/migrate-conta-receber-data-entrega.js
//
// Cria a coluna data_entrega em t_conta_receber.
//
// A conta a receber de um pedido passou a guardar três datas distintas, que
// antes se confundiam:
//
//   data_emissao     quando a cobrança foi criada
//   data_vencimento  quando deveria ser paga
//   data_entrega     quando a mercadoria saiu   ← esta
//   data_recebimento quando foi efetivamente paga
//
// Sem ela, "quando o pedido foi entregue" só existia no t_pedido, e a tela de
// Contas a Receber não tinha como mostrar.
//
// Também preenche a coluna retroativamente para as contas que vieram de
// pedido, usando a data de atualização do pedido entregue — melhor
// aproximação disponível, já que a data exata da entrega não era gravada.
//
//   node scripts/migrate-conta-receber-data-entrega.js            (simula)
//   node scripts/migrate-conta-receber-data-entrega.js --aplicar  (grava)
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

const APLICAR = process.argv.includes('--aplicar')

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
      console.log(`\n${'='.repeat(66)}\n${schema}\n${'='.repeat(66)}`)
      await c.query(`SET search_path TO "${schema}", public`)

      const existeTabela = await c.query(`SELECT to_regclass('t_conta_receber') IS NOT NULL AS existe`)
      if (!existeTabela.rows[0].existe) {
        console.log('  t_conta_receber nao existe neste schema. Pulando.')
        continue
      }

      const jaTem = await c.query(`
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 't_conta_receber' AND column_name = 'data_entrega'
      `, [schema])

      if (jaTem.rows.length > 0) {
        console.log('  Coluna data_entrega ja existe.')
      } else if (!APLICAR) {
        console.log('  Criaria a coluna data_entrega DATE.')
      } else {
        await c.query(`ALTER TABLE t_conta_receber ADD COLUMN data_entrega DATE`)
        console.log('  Coluna data_entrega criada.')
      }

      // Retroativo: contas vindas de pedido entregue.
      const alvo = await c.query(`
        SELECT cr.conta_receber_id, cr.origem_id, p.updated_dt::date AS entregue_em
          FROM t_conta_receber cr
          JOIN t_pedido p ON p.pedido_id = cr.origem_id
         WHERE cr.origem = 'pedido'
           AND cr.active_flg = true
           AND p.status = 'entregue'
      `)

      if (alvo.rows.length === 0) {
        console.log('  Nenhuma conta de pedido para preencher.')
        continue
      }

      console.log(`  ${alvo.rows.length} conta(s) de pedido entregue.`)
      if (!APLICAR) {
        for (const r of alvo.rows.slice(0, 10)) {
          console.log(`     conta ${r.conta_receber_id} · pedido ${r.origem_id} · ${r.entregue_em?.toISOString?.().slice(0, 10) ?? r.entregue_em}`)
        }
        if (alvo.rows.length > 10) console.log(`     ... e mais ${alvo.rows.length - 10}`)
        continue
      }

      const upd = await c.query(`
        UPDATE t_conta_receber cr
           SET data_entrega = p.updated_dt::date
          FROM t_pedido p
         WHERE p.pedido_id = cr.origem_id
           AND cr.origem = 'pedido'
           AND cr.active_flg = true
           AND p.status = 'entregue'
           AND cr.data_entrega IS NULL
      `)
      console.log(`  ${upd.rowCount} conta(s) preenchida(s).`)
    }
  } finally {
    c.release()
    await pool.end()
  }
}

main().catch(err => { console.error('\nERRO:', err.message); process.exit(1) })
