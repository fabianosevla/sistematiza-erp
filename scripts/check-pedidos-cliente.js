// scripts/check-pedidos-cliente.js
//
// Diagnóstico: os pedidos aparecem como "Consumidor Final" porque não têm
// cliente gravado, ou porque a listagem não devolve o nome?
//
// Só lê. Não altera nada.
//
//   node scripts/check-pedidos-cliente.js
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

function conexao() {
  if (process.env.DATABASE_URL) return { connectionString: process.env.DATABASE_URL }
  const host = process.env.DB_HOST
  if (!host) throw new Error('Defina DATABASE_URL ou DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD no .env.local')
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
    // Descobre os tenants em vez de fixar o nome do schema.
    const { rows: schemas } = await c.query(`
      SELECT schema_name FROM information_schema.schemata
      WHERE schema_name LIKE 'tenant\\_%' ESCAPE '\\'
      ORDER BY schema_name
    `)

    for (const { schema_name: schema } of schemas) {
      console.log(`\n══ ${schema}`)
      await c.query(`SET search_path TO "${schema}", public`)

      const ped = await c.query(`
        SELECT p.pedido_id, p.cliente_id,
               cl.nome_completo, cl.nome_fantasia
        FROM t_pedido p
        LEFT JOIN t_cliente cl ON cl.cliente_id = p.cliente_id
        ORDER BY p.pedido_id DESC
        LIMIT 10
      `).catch(e => { console.log('  t_pedido:', e.message); return { rows: [] } })

      console.log('\nÚltimos pedidos:')
      console.table(ped.rows)

      const semCliente = await c.query(`
        SELECT COUNT(*)::int AS total FROM t_pedido WHERE cliente_id IS NULL
      `).catch(() => ({ rows: [{ total: 0 }] }))
      console.log(`Pedidos sem cliente_id: ${semCliente.rows[0]?.total ?? 0}`)

      const ven = await c.query(`
        SELECT v.venda_id, v.cliente_id,
               cl.nome_completo, cl.nome_fantasia
        FROM t_venda v
        LEFT JOIN t_cliente cl ON cl.cliente_id = v.cliente_id
        ORDER BY v.venda_id DESC
        LIMIT 10
      `).catch(e => { console.log('  t_venda:', e.message); return { rows: [] } })

      console.log('\nÚltimas vendas:')
      console.table(ven.rows)

      // Quais colunas t_pedido e t_venda realmente têm — para eu saber se
      // existe algum campo de nome gravado junto (snapshot).
      for (const tabela of ['t_pedido', 't_venda']) {
        const cols = await c.query(`
          SELECT column_name FROM information_schema.columns
          WHERE table_schema = $1 AND table_name = $2
          ORDER BY ordinal_position
        `, [schema, tabela])
        console.log(`\nColunas de ${tabela}:`)
        console.log('  ' + cols.rows.map(r => r.column_name).join(', '))
      }
    }
  } finally {
    c.release()
    await pool.end()
  }
}

main().catch(err => { console.error(err); process.exit(1) })