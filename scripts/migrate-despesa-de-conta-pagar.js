// scripts/migrate-despesa-de-conta-pagar.js
//
// COMPRA A PRAZO NÃO APARECIA NO DRE.
//
// A consulta de Despesas e o DRE leem só t_despesa, por data_despesa. Uma
// compra a prazo abria conta a pagar e mais nada — e o pagamento da conta não
// gerava despesa. Resultado: o custo sumia do resultado, em qualquer mês, e o
// lucro saía maior do que era.
//
// A regra nova é o espelho da venda: dinheiro saiu, despesa nasce. O
// ContasPagarService passou a lançar a despesa na quitação.
//
// Este script faz duas coisas:
//
//   1. cria a coluna t_despesa.conta_pagar_id, que é a trava contra duplicar
//   2. lança as despesas que faltam, para toda conta a pagar JÁ PAGA que ainda
//      não tem despesa correspondente, na data em que foi paga
//
// ATENÇÃO AO EFEITO: o DRE de meses passados vai piorar. Não é perda de dado —
// é custo que já existia e não estava sendo contado.
//
//   node scripts/migrate-despesa-de-conta-pagar.js            (simula)
//   node scripts/migrate-despesa-de-conta-pagar.js --aplicar  (grava)
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
const dia   = d => (d?.toISOString?.().slice(0, 10) ?? String(d ?? '').slice(0, 10))

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

      const ok = await c.query(`
        SELECT to_regclass('t_despesa') IS NOT NULL AS d,
               to_regclass('t_conta_pagar') IS NOT NULL AS cp
      `)
      if (!ok.rows[0].d || !ok.rows[0].cp) {
        console.log('  t_despesa ou t_conta_pagar nao existe neste schema. Pulando.')
        continue
      }

      // 1. Coluna de vinculo
      const temCol = await c.query(`
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 't_despesa' AND column_name = 'conta_pagar_id'
      `, [schema])

      if (temCol.rows.length > 0) {
        console.log('  Coluna conta_pagar_id ja existe.')
      } else if (!APLICAR) {
        console.log('  Criaria a coluna t_despesa.conta_pagar_id INTEGER.')
      } else {
        await c.query(`ALTER TABLE t_despesa ADD COLUMN conta_pagar_id INTEGER`)
        console.log('  Coluna conta_pagar_id criada.')
      }

      // Sem a coluna, a consulta abaixo nem roda. Em simulacao, avisa e segue.
      if (temCol.rows.length === 0 && !APLICAR) {
        console.log('  (a listagem das despesas faltantes so aparece depois de criar a coluna)')
        continue
      }

      // 2. Contas pagas sem despesa
      const { rows } = await c.query(`
        SELECT cp.conta_pagar_id, cp.descricao, cp.categoria, cp.valor_original,
               COALESCE(cp.data_pagamento, cp.data_vencimento) AS quando
          FROM t_conta_pagar cp
          LEFT JOIN t_despesa d
                 ON d.conta_pagar_id = cp.conta_pagar_id AND d.active_flg = true
         WHERE cp.active_flg = true
           AND cp.status = 'paga'
           AND d.despesa_id IS NULL
         ORDER BY quando
      `)

      if (rows.length === 0) {
        console.log('\n  Nenhuma conta paga sem despesa. Nada a lancar.')
        continue
      }

      const soma = rows.reduce((a, r) => a + Number(r.valor_original ?? 0), 0)
      console.log(`\n  ${rows.length} conta(s) paga(s) sem despesa · ${cents(soma)}\n`)
      for (const r of rows.slice(0, 20)) {
        console.log(`     #${String(r.conta_pagar_id).padStart(5)}  ${dia(r.quando)}  ${cents(r.valor_original).padStart(14)}  ${r.descricao ?? ''}`)
      }
      if (rows.length > 20) console.log(`     ... e mais ${rows.length - 20}`)

      if (!APLICAR) {
        console.log('\n  Seriam lancadas como despesa na data do pagamento.')
        console.log('  O DRE dos meses envolvidos vai piorar — esse custo ja existia.')
        continue
      }

      await c.query('BEGIN')
      try {
        const ins = await c.query(`
          INSERT INTO t_despesa
            (nome, categoria, valor, data_despesa, recorrente,
             mes_competencia, ano_competencia, observacao, conta_pagar_id,
             created_by, updated_by, created_dt, updated_dt, active_flg, modification_num)
          SELECT cp.descricao,
                 COALESCE(cp.categoria, 'Outros'),
                 cp.valor_original,
                 COALESCE(cp.data_pagamento, cp.data_vencimento),
                 false,
                 EXTRACT(MONTH FROM COALESCE(cp.data_pagamento, cp.data_vencimento))::int,
                 EXTRACT(YEAR  FROM COALESCE(cp.data_pagamento, cp.data_vencimento))::int,
                 'Lancada retroativamente pelo pagamento da conta a pagar #' || cp.conta_pagar_id,
                 cp.conta_pagar_id,
                 1, 1, NOW(), NOW(), true, 0
            FROM t_conta_pagar cp
            LEFT JOIN t_despesa d
                   ON d.conta_pagar_id = cp.conta_pagar_id AND d.active_flg = true
           WHERE cp.active_flg = true
             AND cp.status = 'paga'
             AND d.despesa_id IS NULL
        `)
        await c.query('COMMIT')
        console.log(`\n  OK — ${ins.rowCount} despesa(s) lancada(s).`)
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
