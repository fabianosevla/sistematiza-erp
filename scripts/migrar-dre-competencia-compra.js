// scripts/migrar-dre-competencia-compra.js
//
// DRE PELA DATA DA COMPRA, CAIXA PELA DATA DO PAGAMENTO (cartão QA #107).
//
// Até aqui a competência de uma despesa era o mês do PAGAMENTO: compra a prazo
// feita em agosto e paga em setembro pesava no DRE de setembro, e só depois de
// paga. O conceito definido pela Zaghi é o inverso — o DRE mostra o que foi
// comprado no mês; o pagamento é assunto do financeiro (contas a pagar).
//
// O código novo já grava assim daqui pra frente. Este script acerta o que já
// existe, em todos os tenants:
//
//   1. despesa ligada a conta a pagar  → data_despesa e competência passam a
//      ser a EMISSÃO da conta; data_pagamento recebe o pagamento da conta
//   2. demais despesas                 → competência = mês de data_despesa
//   3. conta a pagar em aberto sem despesa → lança a despesa pendente, na
//      competência da emissão, sem data de pagamento
//
// ATENÇÃO AO EFEITO: o DRE de meses passados muda — custo sai do mês em que
// foi pago e vai para o mês em que foi comprado. O total do ano não muda
// (exceto pelo passo 3, que traz para o DRE o que ainda não foi pago).
//
//   node scripts/migrar-dre-competencia-compra.js            (simula)
//   node scripts/migrar-dre-competencia-compra.js --aplicar  (grava)
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

// Mes/ano de um timestamp gravado a partir de "AAAA-MM-DD" (meia-noite UTC):
// lido em UTC para devolver o dia que a pessoa escolheu.
const MES = col => `EXTRACT(MONTH FROM (${col} AT TIME ZONE 'UTC'))::int`
const ANO = col => `EXTRACT(YEAR  FROM (${col} AT TIME ZONE 'UTC'))::int`

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
               to_regclass('t_conta_pagar') IS NOT NULL AS cp,
               EXISTS (SELECT 1 FROM information_schema.columns
                        WHERE table_schema = $1 AND table_name = 't_despesa'
                          AND column_name = 'conta_pagar_id') AS col
      `, [schema])
      if (!ok.rows[0].d || !ok.rows[0].cp || !ok.rows[0].col) {
        console.log('  t_despesa / t_conta_pagar / t_despesa.conta_pagar_id ausente. Pulando.')
        continue
      }

      // 1. Despesas ligadas a conta a pagar
      const passo1 = `
        FROM t_despesa d
        JOIN t_conta_pagar cp ON cp.conta_pagar_id = d.conta_pagar_id
       WHERE d.active_flg = true
         AND cp.data_emissao IS NOT NULL
         AND (d.mes_competencia IS DISTINCT FROM EXTRACT(MONTH FROM cp.data_emissao)::int
           OR d.ano_competencia IS DISTINCT FROM EXTRACT(YEAR  FROM cp.data_emissao)::int)
      `
      const p1 = await c.query(`SELECT COUNT(*)::int n, COALESCE(SUM(d.valor),0)::bigint v ${passo1}`)

      // 2. Demais despesas com competência diferente do mês da despesa
      const passo2 = `
        FROM t_despesa d
       WHERE d.active_flg = true
         AND d.conta_pagar_id IS NULL
         AND d.data_despesa IS NOT NULL
         AND (d.mes_competencia IS DISTINCT FROM ${MES('d.data_despesa')}
           OR d.ano_competencia IS DISTINCT FROM ${ANO('d.data_despesa')})
      `
      const p2 = await c.query(`SELECT COUNT(*)::int n, COALESCE(SUM(d.valor),0)::bigint v ${passo2}`)

      // 3. Contas em aberto sem despesa
      const passo3 = `
        FROM t_conta_pagar cp
        LEFT JOIN t_despesa d
               ON d.conta_pagar_id = cp.conta_pagar_id AND d.active_flg = true
       WHERE cp.active_flg = true
         AND cp.status IS DISTINCT FROM 'paga'
         AND d.despesa_id IS NULL
      `
      const p3 = await c.query(`SELECT COUNT(*)::int n, COALESCE(SUM(cp.valor_original),0)::bigint v ${passo3}`)

      console.log(`  1. Despesas de conta a pagar indo para o mes da emissao: ${p1.rows[0].n} · ${cents(p1.rows[0].v)}`)
      console.log(`  2. Despesas avulsas indo para o mes da despesa:          ${p2.rows[0].n} · ${cents(p2.rows[0].v)}`)
      console.log(`  3. Contas em aberto que passam a entrar no DRE:          ${p3.rows[0].n} · ${cents(p3.rows[0].v)}`)

      if (!APLICAR) continue

      await c.query('BEGIN')
      try {
        const r1 = await c.query(`
          UPDATE t_despesa d
             SET data_despesa    = cp.data_emissao,
                 data_pagamento  = CASE WHEN cp.status = 'paga' THEN cp.data_pagamento ELSE d.data_pagamento END,
                 mes_competencia = EXTRACT(MONTH FROM cp.data_emissao)::int,
                 ano_competencia = EXTRACT(YEAR  FROM cp.data_emissao)::int,
                 updated_dt      = NOW()
            FROM t_conta_pagar cp
           WHERE cp.conta_pagar_id = d.conta_pagar_id
             AND d.active_flg = true
             AND cp.data_emissao IS NOT NULL
             AND (d.mes_competencia IS DISTINCT FROM EXTRACT(MONTH FROM cp.data_emissao)::int
               OR d.ano_competencia IS DISTINCT FROM EXTRACT(YEAR  FROM cp.data_emissao)::int)
        `)
        const r2 = await c.query(`
          UPDATE t_despesa d
             SET mes_competencia = ${MES('d.data_despesa')},
                 ano_competencia = ${ANO('d.data_despesa')},
                 updated_dt      = NOW()
           WHERE d.active_flg = true
             AND d.conta_pagar_id IS NULL
             AND d.data_despesa IS NOT NULL
             AND (d.mes_competencia IS DISTINCT FROM ${MES('d.data_despesa')}
               OR d.ano_competencia IS DISTINCT FROM ${ANO('d.data_despesa')})
        `)
        const r3 = await c.query(`
          INSERT INTO t_despesa
            (nome, categoria, valor, data_despesa, data_pagamento, recorrente,
             mes_competencia, ano_competencia, observacao, conta_pagar_id,
             created_by, updated_by, created_dt, updated_dt, active_flg, modification_num)
          SELECT cp.descricao, COALESCE(cp.categoria, 'Outros'), cp.valor_original,
                 cp.data_emissao, NULL, false,
                 EXTRACT(MONTH FROM cp.data_emissao)::int,
                 EXTRACT(YEAR  FROM cp.data_emissao)::int,
                 'Conta a pagar #' || cp.conta_pagar_id, cp.conta_pagar_id,
                 1, 1, NOW(), NOW(), true, 0
          ${passo3}
            AND cp.data_emissao IS NOT NULL
        `)
        await c.query('COMMIT')
        console.log(`\n  OK — ${r1.rowCount} + ${r2.rowCount} despesa(s) reclassificada(s), ${r3.rowCount} lancada(s).`)
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
