require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')
const pool = new Pool({ host: process.env.DB_HOST, port: 5432, database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD, ssl: { rejectUnauthorized: false } })
const SCHEMA = 'tenant_zaghi_massas_caseiras'
pool.connect().then(async client => {
  await client.query(`SET search_path TO "${SCHEMA}", public`)

  // Inativa todos os produtos duplicados — mantém só o de maior ID por nome
  const r = await client.query(`
    UPDATE t_produto SET active_flg = false
    WHERE produto_id NOT IN (
      SELECT MAX(produto_id) FROM t_produto GROUP BY nome
    )
    RETURNING produto_id, nome
  `)
  console.log(`\nInativados ${r.rowCount} produtos duplicados:`)
  r.rows.forEach(row => console.log(`  ID ${row.produto_id}: ${row.nome}`))

  // Confirma o que sobrou ativo
  const ativos = await client.query(`SELECT produto_id, nome FROM t_produto WHERE active_flg = true ORDER BY produto_id`)
  console.log(`\nProdutos ativos restantes (${ativos.rowCount}):`)
  ativos.rows.forEach(row => console.log(`  ID ${row.produto_id}: ${row.nome}`))

  client.release(); pool.end()
}).catch(err => { console.error('Erro:', err.message); process.exit(1) })