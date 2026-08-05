// scripts/check-financeiro-completo.js
//
// Responde duas perguntas de uma vez:
//
// 1. A aba "A Receber" não aparece mesmo depois de ligar o interruptor.
//    Suspeita: a coluna contas_receber_ativo não existe em
//    t_configuracoes_tenant. Como a rota de configurações só grava em coluna
//    existente, o toggle liga na tela e não persiste.
//
// 2. As vendas aparecem como "Consumidor Final".
//    Mostra cliente_id e origem das últimas vendas — se a venda vinda de
//    pedido tiver cliente_id preenchido e ainda assim a tela mostrar
//    Consumidor Final, o problema é o VendaService não ter sido salvo.
//
// Só lê. Não altera nada.
//
//   node scripts/check-financeiro-completo.js
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

const FLAGS = [
  'contas_pagar_ativo',
  'contas_receber_ativo',
  'conciliacao_bancaria_ativo',
]

const TABELAS = [
  't_conta_pagar',
  't_conta_receber',
  't_conta_bancaria',
  't_extrato_bancario',
]

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

      // ── 1. Colunas de flag ────────────────────────────────────────────
      const { rows: cols } = await c.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 't_configuracoes_tenant'
      `, [schema])
      const existentes = new Set(cols.map(r => r.column_name))

      console.log('\nColunas de flag em t_configuracoes_tenant:')
      for (const f of FLAGS) {
        console.log(`  ${existentes.has(f) ? 'existe   ' : 'FALTANDO '} ${f}`)
      }

      // Valor gravado hoje, só das que existem
      const presentes = FLAGS.filter(f => existentes.has(f))
      if (presentes.length > 0) {
        const sel = presentes.join(', ')
        const { rows } = await c.query(`SELECT ${sel} FROM t_configuracoes_tenant LIMIT 1`)
        console.log('\nValor atual das flags:')
        console.table(rows)
      }

      // ── 2. Tabelas do Financeiro Completo ─────────────────────────────
      console.log('\nTabelas do Financeiro Completo:')
      for (const t of TABELAS) {
        const { rows } = await c.query(`
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = $1 AND table_name = $2
        `, [schema, t])
        console.log(`  ${rows.length > 0 ? 'existe   ' : 'FALTANDO '} ${t}`)
      }

      // ── 3. Vendas recentes ────────────────────────────────────────────
      const ven = await c.query(`
        SELECT v.venda_id, v.origem, v.cliente_id, v.total,
               cl.nome_completo, cl.nome_fantasia
        FROM t_venda v
        LEFT JOIN t_cliente cl ON cl.cliente_id = v.cliente_id
        ORDER BY v.venda_id DESC LIMIT 10
      `).catch(e => { console.log('  t_venda:', e.message); return { rows: [] } })
      console.log('\nÚltimas vendas:')
      console.table(ven.rows)

      // ── 4. Contas a receber existentes ────────────────────────────────
      const cr = await c.query(`
        SELECT conta_receber_id, descricao, nome_cliente, valor_original,
               data_vencimento::text AS vencimento, status, origem, origem_id
        FROM t_conta_receber
        ORDER BY conta_receber_id DESC LIMIT 10
      `).catch(e => { console.log('  t_conta_receber:', e.message); return { rows: [] } })
      console.log('\nContas a receber:')
      if (cr.rows.length === 0) console.log('  nenhuma')
      else console.table(cr.rows)

      // ── 5. Pedidos entregues e seus vínculos ──────────────────────────
      const ped = await c.query(`
        SELECT pedido_id, status, cliente_id, venda_id
        FROM t_pedido WHERE active_flg = true
        ORDER BY pedido_id DESC LIMIT 10
      `).catch(() => ({ rows: [] }))
      console.log('\nPedidos:')
      console.table(ped.rows)
    }
  } finally {
    c.release()
    await pool.end()
  }
}

main().catch(err => { console.error(err); process.exit(1) })