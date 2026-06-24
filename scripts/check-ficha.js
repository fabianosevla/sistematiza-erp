require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')
const pool = new Pool({ host: process.env.DB_HOST, port: 5432, database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD, ssl: { rejectUnauthorized: false } })
const SCHEMA = 'tenant_zaghi_massas_caseiras'
pool.connect().then(async client => {
  await client.query(`SET search_path TO "${SCHEMA}", public`)
  const r = await client.query(`
    SELECT pi.produto_id, p.nome as produto, pi.insumo_id, i.nome as insumo,
           pi.quantidade, pi.unidade, pi.active_flg
    FROM t_produto_insumo pi
    JOIN t_produto p ON p.produto_id = pi.produto_id
    JOIN t_insumo i ON i.insumo_id = pi.insumo_id
    ORDER BY p.nome
  `)
  console.log('\nFichas técnicas no banco:')
  r.rows.forEach(row => console.log(row))
  client.release(); pool.end()
}).catch(err => { console.error('Erro:', err.message); process.exit(1) })