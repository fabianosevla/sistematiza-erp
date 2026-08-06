// scripts/check-produtos-sem-preco.js
//
// PRODUTO SEM PREÇO É VENDA POR ZERO.
//
// O Pão de Queijo apareceu com valor zerado num pedido antigo, e a causa foi
// simples: ele nunca teve preço no cadastro. O PDV e o Pedido resolvem o preço
// pela cadeia varejo → atacado → preço de venda; quando todas estão vazias, a
// venda fecha com R$ 0,00 sem reclamar de nada.
//
// Este script lista quem está nessa situação. Só lê — o preço é decisão de
// negócio e tem que ser digitado em Cadastros → Produtos.
//
//   node scripts/check-produtos-sem-preco.js
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

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

async function main() {
  const pool = new Pool(conexao())
  const c    = await pool.connect()

  try {
    const { rows: schemas } = await c.query(`
      SELECT schema_name FROM information_schema.schemata
      WHERE schema_name LIKE 'tenant\\_%' ESCAPE '\\' ORDER BY schema_name
    `)

    for (const { schema_name: schema } of schemas) {
      console.log(`\n${'═'.repeat(70)}\n${schema}\n${'═'.repeat(70)}`)
      await c.query(`SET search_path TO "${schema}", public`)

      // insumo_flg: produto-insumo não é vendável, então preço zero ali é
      // esperado e não deve poluir a lista.
      const { rows } = await c.query(`
        SELECT produto_id, nome, unidade,
               COALESCE(preco_varejo, 0)   AS varejo,
               COALESCE(preco_atacado_a, 0) AS atacado_a,
               COALESCE(preco_custo, 0)    AS custo,
               COALESCE(insumo_flg, false) AS eh_insumo,
               COALESCE(revenda, false)    AS revenda
        FROM t_produto
        WHERE active_flg = true
        ORDER BY nome
      `)

      const vendaveis = rows.filter(r => !r.eh_insumo)
      const semPreco  = vendaveis.filter(r => Number(r.varejo) === 0 && Number(r.atacado_a) === 0)

      if (semPreco.length === 0) {
        console.log('\n  Todos os produtos vendáveis têm preço.')
      } else {
        console.log(`\n  SEM PREÇO DE VENDA — ${semPreco.length} produto(s).`)
        console.log('  Se algum destes for vendido no PDV, a venda fecha em R$ 0,00.\n')
        for (const r of semPreco) {
          console.log(`     ${String(r.produto_id).padStart(4)}  ${r.nome}`)
          console.log(`           unidade ${r.unidade ?? '—'} · custo ${cents(r.custo)}${r.revenda ? ' · revenda' : ''}`)
        }
        console.log('\n  Correção: Cadastros → Produtos → preencher Preço de varejo.')
      }

      // Custo zerado não impede venda, mas zera a margem da ficha técnica.
      const semCusto = vendaveis.filter(r => Number(r.custo) === 0)
      if (semCusto.length > 0) {
        console.log(`\n  SEM CUSTO — ${semCusto.length} produto(s). A margem destes sai como 100%.`)
        for (const r of semCusto.slice(0, 15)) console.log(`     ${r.nome}`)
        if (semCusto.length > 15) console.log(`     ... e mais ${semCusto.length - 15}`)
        console.log('  Para fabricado, o custo vem da ficha técnica. Para revenda, é digitado no cadastro.')
      }
    }
  } finally {
    c.release()
    await pool.end()
  }
}

main().catch(err => { console.error('\nERRO:', err.message); process.exit(1) })
