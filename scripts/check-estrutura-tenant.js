// scripts/check-estrutura-tenant.js
//
// LEVANTAMENTO DA ESTRUTURA DE UM SCHEMA DE TENANT. SÓ LÊ, NÃO ALTERA NADA.
//
// Passo 1 do plano em docs/provisionamento.md. A ideia lá é criar um
// tenant_modelo clonando a estrutura da Zaghi com:
//
//   CREATE TABLE novo.t_x (LIKE origem.t_x INCLUDING ALL)
//
// `INCLUDING ALL` copia tipo, default, NOT NULL, chave primária, índice e
// check constraint. NÃO copia:
//
//   • foreign key
//   • trigger
//   • view e materialized view
//   • função, procedure, tipo/enum próprio do schema
//   • policy de RLS
//
// E tem uma armadilha pior que ausência, porque é silenciosa: coluna `serial`
// não é `IDENTITY`. O default dela é `nextval('..._seq')` apontando para uma
// sequence com nome qualificado. `LIKE INCLUDING ALL` copia esse default como
// está — e o schema novo passa a puxar id da sequence do schema ORIGINAL.
//
// O sintoma não seria erro: seriam dois clientes consumindo a mesma numeração,
// e o dia em que o schema de origem fosse apagado, todo INSERT do outro
// quebraria. Este script conta essas colunas.
//
// Rode antes de escrever qualquer linha do provisionamento. Se ele acusar FK,
// trigger, view ou função, o plano muda.
//
//   node scripts/check-estrutura-tenant.js
//   node scripts/check-estrutura-tenant.js tenant_zaghi_massas_caseiras
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

const SCHEMA = process.argv[2] || 'tenant_zaghi_massas_caseiras'

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

function titulo(t) {
  console.log(`\n${'─'.repeat(72)}\n${t}\n${'─'.repeat(72)}`)
}

/** Imprime o veredito de um item: quantos são e o que isso significa. */
function veredito(n, seZero, seTem) {
  console.log(n === 0 ? `  OK — ${seZero}` : `  ATENCAO — ${n} ${seTem}`)
}

async function main() {
  const pool = new Pool(conexao())
  const c    = await pool.connect()

  try {
    const existe = await c.query(
      `SELECT 1 FROM information_schema.schemata WHERE schema_name = $1`, [SCHEMA],
    )
    if (existe.rows.length === 0) {
      console.log(`\nSchema "${SCHEMA}" nao existe.`)
      return
    }

    console.log(`\n${'='.repeat(72)}`)
    console.log(`ESTRUTURA DE ${SCHEMA}`)
    console.log(`${'='.repeat(72)}`)

    // ── Tabelas ──────────────────────────────────────────────────────────────
    const tabelas = await c.query(`
      SELECT table_name FROM information_schema.tables
       WHERE table_schema = $1 AND table_type = 'BASE TABLE'
       ORDER BY table_name
    `, [SCHEMA])
    titulo(`TABELAS — ${tabelas.rows.length}`)
    console.log('  ' + tabelas.rows.map(r => r.table_name).join(', '))

    // ── Foreign keys ─────────────────────────────────────────────────────────
    // LIKE nao copia. Se houver, o provisionamento precisa recria-las depois.
    const fks = await c.query(`
      SELECT con.conname, cl.relname AS tabela,
             pg_get_constraintdef(con.oid) AS definicao
        FROM pg_constraint con
        JOIN pg_class cl ON cl.oid = con.conrelid
        JOIN pg_namespace ns ON ns.oid = cl.relnamespace
       WHERE ns.nspname = $1 AND con.contype = 'f'
       ORDER BY cl.relname, con.conname
    `, [SCHEMA])
    titulo(`FOREIGN KEYS — ${fks.rows.length}`)
    veredito(fks.rows.length,
      'LIKE INCLUDING ALL da conta sozinho.',
      'FK(s) precisam ser recriadas apos o clone.')
    for (const r of fks.rows.slice(0, 30)) {
      console.log(`     ${r.tabela}.${r.conname}`)
      console.log(`        ${r.definicao}`)
    }
    if (fks.rows.length > 30) console.log(`     ... e mais ${fks.rows.length - 30}`)

    // ── Triggers ─────────────────────────────────────────────────────────────
    const trg = await c.query(`
      SELECT t.tgname, cl.relname AS tabela
        FROM pg_trigger t
        JOIN pg_class cl ON cl.oid = t.tgrelid
        JOIN pg_namespace ns ON ns.oid = cl.relnamespace
       WHERE ns.nspname = $1 AND NOT t.tgisinternal
       ORDER BY cl.relname, t.tgname
    `, [SCHEMA])
    titulo(`TRIGGERS — ${trg.rows.length}`)
    veredito(trg.rows.length,
      'nada a recriar.',
      'trigger(s) precisam ser recriados apos o clone.')
    for (const r of trg.rows) console.log(`     ${r.tabela}.${r.tgname}`)

    // ── Views ────────────────────────────────────────────────────────────────
    const views = await c.query(`
      SELECT table_name, 'view' AS tipo FROM information_schema.views WHERE table_schema = $1
      UNION ALL
      SELECT matviewname, 'materializada' FROM pg_matviews WHERE schemaname = $1
      ORDER BY 1
    `, [SCHEMA])
    titulo(`VIEWS — ${views.rows.length}`)
    veredito(views.rows.length, 'nada a recriar.', 'view(s) precisam ser recriadas.')
    for (const r of views.rows) console.log(`     ${r.table_name} (${r.tipo})`)

    // ── Funções e tipos próprios ─────────────────────────────────────────────
    const fn = await c.query(`
      SELECT p.proname FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = $1 ORDER BY p.proname
    `, [SCHEMA])
    titulo(`FUNCOES / PROCEDURES — ${fn.rows.length}`)
    veredito(fn.rows.length, 'nada a recriar.', 'funcao(oes) vivem neste schema.')
    for (const r of fn.rows) console.log(`     ${r.proname}`)

    const tipos = await c.query(`
      SELECT t.typname FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = $1 AND t.typtype IN ('e','c','d')
        AND NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.reltype = t.oid)
      ORDER BY t.typname
    `, [SCHEMA])
    titulo(`TIPOS PROPRIOS (enum, composto, domain) — ${tipos.rows.length}`)
    veredito(tipos.rows.length, 'usa so tipos nativos.', 'tipo(s) precisam ser recriados antes das tabelas.')
    for (const r of tipos.rows) console.log(`     ${r.typname}`)

    // ── RLS ──────────────────────────────────────────────────────────────────
    const pol = await c.query(`SELECT policyname, tablename FROM pg_policies WHERE schemaname = $1`, [SCHEMA])
    titulo(`POLICIES DE RLS — ${pol.rows.length}`)
    veredito(pol.rows.length, 'sem RLS neste schema.', 'policy(ies) precisam ser recriadas.')
    for (const r of pol.rows) console.log(`     ${r.tablename}.${r.policyname}`)

    // ── A ARMADILHA: serial x identity ───────────────────────────────────────
    //
    // is_identity = 'YES'  → LIKE INCLUDING ALL cria sequence nova. Seguro.
    // default com nextval  → serial antigo: o default aponta para a sequence
    //                        do schema de origem e seria copiado como está.
    const cols = await c.query(`
      SELECT table_name, column_name, is_identity, column_default
        FROM information_schema.columns
       WHERE table_schema = $1
         AND (is_identity = 'YES' OR column_default LIKE 'nextval%')
       ORDER BY table_name, column_name
    `, [SCHEMA])

    const identity = cols.rows.filter(r => r.is_identity === 'YES')
    const serial   = cols.rows.filter(r => r.is_identity !== 'YES')

    titulo(`COLUNAS AUTOINCREMENTO — ${cols.rows.length}`)
    console.log(`  IDENTITY: ${identity.length}   ·   serial (nextval): ${serial.length}`)
    if (serial.length > 0) {
      console.log('')
      console.log('  ATENCAO — estas sao serial, nao IDENTITY.')
      console.log('  O default delas aponta para uma sequence com nome qualificado.')
      console.log('  Clonar com LIKE INCLUDING ALL faria o schema novo puxar id da')
      console.log('  sequence do schema de origem: dois clientes na mesma numeracao,')
      console.log('  e todo INSERT quebrando no dia em que a origem fosse apagada.')
      console.log('')
      console.log('  O provisionamento precisa, para cada uma: criar sequence propria,')
      console.log('  apontar o default para ela e reiniciar em 1.')
      console.log('')
      for (const r of serial.slice(0, 15)) {
        console.log(`     ${r.table_name}.${r.column_name}`)
        console.log(`        ${r.column_default}`)
      }
      if (serial.length > 15) console.log(`     ... e mais ${serial.length - 15}`)
    }

    // ── Índices e checks: copiados, só para dimensionar ──────────────────────
    const idx = await c.query(`SELECT COUNT(*)::int AS n FROM pg_indexes WHERE schemaname = $1`, [SCHEMA])
    const chk = await c.query(`
      SELECT COUNT(*)::int AS n FROM pg_constraint con
      JOIN pg_class cl ON cl.oid = con.conrelid
      JOIN pg_namespace ns ON ns.oid = cl.relnamespace
      WHERE ns.nspname = $1 AND con.contype = 'c'
    `, [SCHEMA])
    titulo('COPIADOS PELO LIKE — nada a fazer')
    console.log(`  indices: ${idx.rows[0].n}   ·   check constraints: ${chk.rows[0].n}`)

    // ── Veredito ─────────────────────────────────────────────────────────────
    titulo('VEREDITO')
    const pendencias = []
    if (fks.rows.length   > 0) pendencias.push(`${fks.rows.length} foreign key(s)`)
    if (trg.rows.length   > 0) pendencias.push(`${trg.rows.length} trigger(s)`)
    if (views.rows.length > 0) pendencias.push(`${views.rows.length} view(s)`)
    if (fn.rows.length    > 0) pendencias.push(`${fn.rows.length} funcao(oes)`)
    if (tipos.rows.length > 0) pendencias.push(`${tipos.rows.length} tipo(s) proprio(s)`)
    if (pol.rows.length   > 0) pendencias.push(`${pol.rows.length} policy(ies)`)
    if (serial.length     > 0) pendencias.push(`${serial.length} sequence(s) de coluna serial`)

    if (pendencias.length === 0) {
      console.log('  Clone com LIKE INCLUDING ALL da conta do recado sozinho.')
    } else {
      console.log('  O provisionamento precisa tratar, alem do LIKE:')
      for (const p of pendencias) console.log(`     · ${p}`)
    }
    console.log('')
  } finally {
    c.release()
    await pool.end()
  }
}

main().catch(err => { console.error('\nERRO:', err.message); process.exit(1) })
