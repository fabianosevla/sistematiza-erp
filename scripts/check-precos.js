/**
 * Diagnóstico SOMENTE LEITURA dos preços de produto.
 * Não altera nada. Rodar: node scripts/check-precos.js
 */
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

const pool = new Pool({
  host: process.env.DB_HOST, port: 5432,
  database: process.env.DB_NAME, user: process.env.DB_USER,
  password: process.env.DB_PASSWORD, ssl: { rejectUnauthorized: false },
})

pool.connect().then(async client => {
  const res = await client.query(`
    SELECT schema_name FROM information_schema.schemata
    WHERE schema_name LIKE 'tenant_%' ORDER BY schema_name
  `)

  for (const { schema_name: schema } of res.rows) {
    await client.query(`SET search_path TO "${schema}", public`)

    const resumo = await client.query(`
      SELECT
        COUNT(*)::int                                          AS total,
        COUNT(*) FILTER (WHERE COALESCE(preco_varejo,0) > 0)::int AS com_varejo,
        COUNT(*) FILTER (WHERE COALESCE(preco_custo,0)  > 0)::int AS com_custo
      FROM t_produto WHERE active_flg = true
    `)
    const r = resumo.rows[0]
    console.log(`\n=== ${schema} ===`)
    console.log(`ativos: ${r.total} | com preço varejo: ${r.com_varejo} | com preço custo: ${r.com_custo}`)

    const amostra = await client.query(`
      SELECT produto_id, nome, preco_custo, preco_varejo, updated_dt, updated_by, modification_num
      FROM t_produto WHERE active_flg = true
      ORDER BY updated_dt DESC NULLS LAST LIMIT 10
    `)
    console.log('\núltimos 10 alterados:')
    for (const p of amostra.rows) {
      const d = p.updated_dt ? new Date(p.updated_dt).toLocaleString('pt-BR') : '—'
      console.log(`  #${p.produto_id} ${String(p.nome).padEnd(38).slice(0, 38)} custo=${p.preco_custo} varejo=${p.preco_varejo} mod=${p.modification_num} em ${d}`)
    }
  }

  console.log('')
  client.release()
  pool.end()
}).catch(err => { console.error('Erro:', err.message); process.exit(1) })