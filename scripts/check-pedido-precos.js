// scripts/check-pedido-precos.js
//
// O pedido #1 mostra "R$ 0,00" no item, mas o produto tem preço cadastrado.
//
// Hipótese: o preço é gravado NO ITEM, no momento em que ele é adicionado
// (t_pedido_item.preco_unitario). Se o pedido foi criado quando a tela ainda
// não resolvia o preço direito, o zero ficou gravado — e nenhuma mudança de
// preço no produto conserta um pedido antigo, porque o valor é uma fotografia
// do momento da venda, não um vínculo ao cadastro.
//
// Isto importa mais agora: entregar um pedido com item zerado gera venda de
// R$ 0,00 e conta a receber de R$ 0,00.
//
// Só lê. Não altera nada.
//
//   node scripts/check-pedido-precos.js
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

const cent = (v) => (Number(v ?? 0) / 100)
  .toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

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

      const itens = await c.query(`
        SELECT i.pedido_id, p.status,
               i.produto_id, i.nome_produto, i.quantidade,
               i.preco_unitario AS preco_no_item,
               i.subtotal,
               pr.preco_varejo  AS preco_atual_varejo,
               pr.preco_atacado_a AS preco_atual_atacado_a
        FROM t_pedido_item i
        JOIN t_pedido  p  ON p.pedido_id  = i.pedido_id AND p.active_flg = true
        LEFT JOIN t_produto pr ON pr.produto_id = i.produto_id
        WHERE i.active_flg = true
        ORDER BY i.pedido_id DESC, i.item_id
      `)

      console.log('\nItens de pedido (preço gravado × preço atual do produto):')
      console.table(itens.rows.map(r => ({
        pedido:        r.pedido_id,
        status:        r.status,
        produto:       r.nome_produto,
        qtd:           r.quantidade,
        no_item:       cent(r.preco_no_item),
        subtotal:      cent(r.subtotal),
        varejo_hoje:   cent(r.preco_atual_varejo),
        atacado_a_hoje: cent(r.preco_atual_atacado_a),
      })))

      const zerados = itens.rows.filter(r => Number(r.preco_no_item ?? 0) === 0)
      if (zerados.length > 0) {
        console.log(`\n${zerados.length} item(ns) com preço ZERADO no pedido.`)
        console.log('Entregar esses pedidos geraria venda e conta a receber de R$ 0,00.')
        const abertos = zerados.filter(r => ['pendente', 'producao', 'pronto'].includes(r.status))
        if (abertos.length > 0) {
          console.log(`\n${abertos.length} deles ainda podem ser corrigidos editando o pedido`)
          console.log('(remover o item e adicionar de novo repuxa o preço do cadastro).')
        }
      } else {
        console.log('\nNenhum item com preço zerado.')
      }
    }
  } finally {
    c.release()
    await pool.end()
  }
}

main().catch(err => { console.error(err); process.exit(1) })