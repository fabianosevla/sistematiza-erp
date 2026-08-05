// scripts/check-pedidos-estoque.js
//
// Mede o efeito do comportamento antigo dos Pedidos sobre o estoque.
//
// Como era: marcar um pedido como "Pronto" SOMAVA a quantidade no estoque do
// produto. Marcar como "Entregue" SUBTRAÍA. Como a produção já é lançada na
// grade de Produção, o "Pronto" somava um estoque que já tinha entrado ali —
// contando duas vezes.
//
// Efeito por status do pedido HOJE:
//   pronto     → somou e ainda não subtraiu: o estoque está INFLADO nessa qtd
//   entregue   → somou e subtraiu: efeito líquido zero, não distorce
//   cancelado  → se passou por pronto, somou e subtraiu; senão, não mexeu
//   pendente   → nunca mexeu
//   producao   → nunca mexeu
//
// Ou seja: a distorção viva está nos pedidos com status 'pronto'.
//
// Este script SÓ LÊ. Não altera nada.
//
//   node scripts/check-pedidos-estoque.js
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
    const { rows: schemas } = await c.query(`
      SELECT schema_name FROM information_schema.schemata
      WHERE schema_name LIKE 'tenant\\_%' ESCAPE '\\'
      ORDER BY schema_name
    `)

    for (const { schema_name: schema } of schemas) {
      console.log(`\n══════ ${schema}`)
      await c.query(`SET search_path TO "${schema}", public`)

      // 1. Quantos pedidos em cada status
      const porStatus = await c.query(`
        SELECT status, COUNT(*)::int AS pedidos
        FROM t_pedido WHERE active_flg = true
        GROUP BY status ORDER BY status
      `)
      console.log('\nPedidos por status:')
      console.table(porStatus.rows)

      // 2. A distorção viva: itens de pedidos que estão em 'pronto'
      const inflado = await c.query(`
        SELECT
          p2.produto_id,
          p2.nome,
          p2.estoque_atual::numeric AS estoque_hoje,
          SUM(i.quantidade)::numeric AS somado_por_pedido_pronto,
          (p2.estoque_atual - SUM(i.quantidade))::numeric AS estoque_sem_a_soma
        FROM t_pedido p
        JOIN t_pedido_item i ON i.pedido_id = p.pedido_id AND i.active_flg = true
        JOIN t_produto p2    ON p2.produto_id = i.produto_id
        WHERE p.active_flg = true AND p.status = 'pronto'
        GROUP BY p2.produto_id, p2.nome, p2.estoque_atual
        ORDER BY p2.nome
      `)

      console.log('\nEstoque INFLADO por pedidos em "Pronto":')
      if (inflado.rows.length === 0) {
        console.log('  nenhum — não há pedido parado em Pronto')
      } else {
        console.table(inflado.rows)
        console.log('  "estoque_sem_a_soma" é como ficaria se o Pronto nunca tivesse somado.')
        console.log('  Se der negativo, o produto foi vendido além do que a produção registrou.')
      }

      // 3. Pedidos entregues — efeito líquido zero, mas sem venda gerada
      const entregues = await c.query(`
        SELECT
          COUNT(DISTINCT p.pedido_id)::int AS pedidos_entregues,
          COALESCE(SUM(i.quantidade * i.preco_unitario), 0)::bigint AS faturamento_centavos
        FROM t_pedido p
        JOIN t_pedido_item i ON i.pedido_id = p.pedido_id AND i.active_flg = true
        WHERE p.active_flg = true AND p.status = 'entregue'
      `)
      const e = entregues.rows[0] ?? {}
      const reais = (Number(e.faturamento_centavos ?? 0) / 100)
        .toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
      console.log(`\nPedidos entregues: ${e.pedidos_entregues ?? 0}`)
      console.log(`Faturamento que NUNCA virou venda: ${reais}`)
      console.log('  Esse valor não está no DRE, no dashboard nem no ticket médio.')

      // 4. Pedidos com venda_id preenchido — deve ser zero (nunca foi implementado)
      const comVenda = await c.query(`
        SELECT COUNT(*)::int AS total FROM t_pedido
        WHERE active_flg = true AND venda_id IS NOT NULL
      `).catch(() => ({ rows: [{ total: 0 }] }))
      console.log(`\nPedidos já vinculados a uma venda: ${comVenda.rows[0]?.total ?? 0}`)

      // 5. Produtos com estoque negativo ou zerado — sintoma que você viu na grade
      const negativos = await c.query(`
        SELECT produto_id, nome, estoque_atual::numeric, estoque_minimo::numeric
        FROM t_produto
        WHERE active_flg = true AND estoque_atual < 0
        ORDER BY estoque_atual
      `)
      console.log('\nProdutos com estoque NEGATIVO:')
      if (negativos.rows.length === 0) console.log('  nenhum')
      else console.table(negativos.rows)
    }
  } finally {
    c.release()
    await pool.end()
  }
}

main().catch(err => { console.error(err); process.exit(1) })