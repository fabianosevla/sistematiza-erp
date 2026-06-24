require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')
const pool = new Pool({ host: process.env.DB_HOST, port: 5432, database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD, ssl: { rejectUnauthorized: false } })
const SCHEMA = 'tenant_zaghi_massas_caseiras'
pool.connect().then(async client => {
  await client.query(`SET search_path TO "${SCHEMA}", public`)
  const r = await client.query(`
    SELECT pi.produto_insumo_id, pi.produto_id, p.nome as produto, p.active_flg as produto_ativo,
           i.nome as insumo, pi.quantidade, pi.unidade as unidade_ficha,
           i.unidade as unidade_estoque, i.estoque_atual, pi.active_flg as ficha_ativa
    FROM t_produto_insumo pi
    JOIN t_produto p ON p.produto_id = pi.produto_id
    JOIN t_insumo i ON i.insumo_id = pi.insumo_id
    ORDER BY p.nome, i.nome
  `)
  console.log('\nTodas fichas tecnicas (ativos e inativos):')
  r.rows.forEach(row => console.log(JSON.stringify(row)))
  client.release(); pool.end()
}).catch(err => { console.error('Erro:', err.message); process.exit(1) })