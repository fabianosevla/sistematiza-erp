require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')
const pool = new Pool({ host: process.env.DB_HOST, port: 5432, database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD, ssl: { rejectUnauthorized: false } })
pool.connect().then(async client => {
  await client.query('SET search_path TO "tenant_zaghi_massas_caseiras", public')
  const r = await client.query(`
    SELECT TO_CHAR(DATE_TRUNC('month', vendida_em), 'Mon/YY') as mes,
           COALESCE(SUM(total),0)::bigint as valor, COUNT(*)::int as qtd
    FROM t_venda WHERE active_flg=true AND vendida_em >= NOW()-INTERVAL '6 months'
    GROUP BY DATE_TRUNC('month', vendida_em) ORDER BY DATE_TRUNC('month', vendida_em)
  `)
  console.log('Faturamento 6m:', r.rows)
  const r2 = await client.query(`SELECT COALESCE(SUM(total),0) as hoje FROM t_venda WHERE active_flg=true AND vendida_em >= NOW()-INTERVAL '1 day'`)
  console.log('Receita hoje:', r2.rows)
  client.release(); pool.end()
}).catch(err => { console.error(err.message); process.exit(1) })