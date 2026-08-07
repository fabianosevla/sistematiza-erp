// scripts/desfazer-vendas-de-pedido.js
//
// DESFAZ AS VENDAS CRIADAS PELA REGRA ANTIGA DE ENTREGA DE PEDIDO.
//
// Até agora, confirmar a entrega de um pedido criava a venda na mesma
// transação. A regra mudou: entrega move mercadoria e abre cobrança; a venda
// só nasce quando a conta a receber é quitada.
//
// Este script inativa as vendas que a regra antiga gerou (origem = 'pedido'),
// para que o histórico não fique com faturamento de pedido que ninguém pagou.
//
// NÃO DEVOLVE ESTOQUE, e isso é deliberado. Quem baixou o estoque foi a
// entrega, com movimentação própria registrada em t_movimentacao_estoque — e a
// entrega continua valendo. Devolver aqui inflaria o estoque de produto pela
// quantidade de todos os pedidos já entregues.
//
// Também limpa t_pedido.venda_id, senão o pedido continuaria marcado como
// faturado e a baixa da conta a receber não geraria a venda nova.
//
//   node scripts/desfazer-vendas-de-pedido.js            (simula)
//   node scripts/desfazer-vendas-de-pedido.js --aplicar  (grava)
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

const cents = v => (Number(v ?? 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

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
      console.log(`\n${'='.repeat(70)}\n${schema}\n${'='.repeat(70)}`)
      await c.query(`SET search_path TO "${schema}", public`)

      const existe = await c.query(`SELECT to_regclass('t_venda') IS NOT NULL AS existe`)
      if (!existe.rows[0].existe) {
        console.log('  t_venda nao existe neste schema. Pulando.')
        continue
      }

      const { rows } = await c.query(`
        SELECT v.venda_id, v.total, v.vendida_em::date AS data, v.observacao
          FROM t_venda v
         WHERE v.origem = 'pedido' AND v.active_flg = true
         ORDER BY v.venda_id
      `)

      if (rows.length === 0) {
        console.log('\n  Nenhuma venda com origem "pedido". Nada a desfazer.')
        continue
      }

      const soma = rows.reduce((a, r) => a + Number(r.total ?? 0), 0)
      console.log(`\n  ${rows.length} venda(s) com origem "pedido" · ${cents(soma)}\n`)
      for (const r of rows.slice(0, 20)) {
        console.log(`     #${String(r.venda_id).padStart(5)}  ${r.data?.toISOString?.().slice(0, 10) ?? r.data}  ${cents(r.total).padStart(14)}  ${r.observacao ?? ''}`)
      }
      if (rows.length > 20) console.log(`     ... e mais ${rows.length - 20}`)

      if (!APLICAR) {
        console.log('\n  Seriam inativadas. O estoque NAO seria alterado.')
        console.log('  Rode com --aplicar para gravar.')
        continue
      }

      await c.query('BEGIN')
      try {
        const v = await c.query(`
          UPDATE t_venda SET active_flg = false, status = 'cancelada', updated_dt = NOW()
           WHERE origem = 'pedido' AND active_flg = true
        `)
        const i = await c.query(`
          UPDATE t_venda_item SET active_flg = false, updated_dt = NOW()
           WHERE venda_id IN (SELECT venda_id FROM t_venda WHERE origem = 'pedido')
        `)
        const p = await c.query(`
          UPDATE t_venda_pagamento SET active_flg = false, updated_dt = NOW()
           WHERE venda_id IN (SELECT venda_id FROM t_venda WHERE origem = 'pedido')
        `)
        // Sem isso o pedido segue marcado como faturado e a baixa da conta a
        // receber não criaria a venda nova.
        const ped = await c.query(`
          UPDATE t_pedido SET venda_id = NULL, updated_dt = NOW()
           WHERE venda_id IS NOT NULL
        `)
        await c.query('COMMIT')

        console.log(`\n  OK — ${v.rowCount} venda(s), ${i.rowCount} item(ns), ${p.rowCount} pagamento(s) inativados.`)
        console.log(`  ${ped.rowCount} pedido(s) liberados para faturar na baixa da conta a receber.`)
        console.log('  Estoque intocado, como planejado.')
      } catch (e) {
        await c.query('ROLLBACK')
        throw e
      }
    }
  } finally {
    c.release()
    await pool.end()
  }
}

main().catch(err => { console.error('\nERRO:', err.message); process.exit(1) })
