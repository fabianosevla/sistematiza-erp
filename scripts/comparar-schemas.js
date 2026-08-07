// scripts/comparar-schemas.js
//
// COMPARA A ESTRUTURA DE DOIS SCHEMAS. SÓ LÊ, NÃO ALTERA NADA.
//
// Serve para responder uma pergunta só: a empresa que acabei de provisionar
// tem a mesma estrutura da que está em produção?
//
// Clicar em toda tela do sistema descobre o que quebrou; isto descobre o que
// está faltando antes de quebrar — inclusive em tela que ninguém abriu ainda.
//
//   node scripts/comparar-schemas.js tenant_teste
//   node scripts/comparar-schemas.js tenant_teste tenant_zaghi_massas_caseiras
//
// O segundo argumento é a referência; sem ele, assume a Zaghi.
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

const NOVO      = process.argv[2]
const REFERENCIA = process.argv[3] || 'tenant_zaghi_massas_caseiras'

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

async function tabelas(c, schema) {
  const r = await c.query(`
    SELECT table_name FROM information_schema.tables
     WHERE table_schema = $1 AND table_type = 'BASE TABLE' ORDER BY table_name
  `, [schema])
  return r.rows.map(x => x.table_name)
}

async function colunas(c, schema) {
  const r = await c.query(`
    SELECT table_name, column_name, data_type, is_nullable
      FROM information_schema.columns WHERE table_schema = $1
  `, [schema])
  const mapa = new Map()
  for (const x of r.rows) {
    if (!mapa.has(x.table_name)) mapa.set(x.table_name, new Map())
    mapa.get(x.table_name).set(x.column_name, `${x.data_type}/${x.is_nullable}`)
  }
  return mapa
}

async function main() {
  if (!NOVO) {
    console.log('\nUso: node scripts/comparar-schemas.js <schema_novo> [schema_referencia]')
    process.exit(1)
  }

  const pool = new Pool(conexao())
  const c    = await pool.connect()

  try {
    for (const s of [NOVO, REFERENCIA]) {
      const ok = await c.query(`SELECT 1 FROM information_schema.schemata WHERE schema_name = $1`, [s])
      if (ok.rows.length === 0) throw new Error(`Schema "${s}" nao existe.`)
    }

    console.log(`\n${'='.repeat(72)}`)
    console.log(`novo:       ${NOVO}`)
    console.log(`referencia: ${REFERENCIA}`)
    console.log(`${'='.repeat(72)}`)

    const problemas = []

    // ── Tabelas ─────────────────────────────────────────────────────────────
    const tNovo = await tabelas(c, NOVO)
    const tRef  = await tabelas(c, REFERENCIA)

    const faltando = tRef.filter(t => !tNovo.includes(t))
    const sobrando = tNovo.filter(t => !tRef.includes(t))

    console.log(`\nTABELAS — novo ${tNovo.length} · referencia ${tRef.length}`)
    if (faltando.length === 0 && sobrando.length === 0) {
      console.log('  OK — as mesmas tabelas dos dois lados.')
    }
    if (faltando.length > 0) {
      problemas.push(`${faltando.length} tabela(s) faltando`)
      console.log(`\n  FALTANDO NO NOVO — ${faltando.length}:`)
      for (const t of faltando) console.log(`     ${t}`)
    }
    if (sobrando.length > 0) {
      console.log(`\n  So no novo — ${sobrando.length} (normalmente inofensivo):`)
      for (const t of sobrando) console.log(`     ${t}`)
    }

    // ── Colunas ─────────────────────────────────────────────────────────────
    const cNovo = await colunas(c, NOVO)
    const cRef  = await colunas(c, REFERENCIA)

    const colsFaltando = []
    const colsDiferentes = []

    for (const [tab, colsRef] of cRef) {
      if (!tNovo.includes(tab)) continue           // já reportada como tabela faltando
      const colsNovo = cNovo.get(tab) ?? new Map()
      for (const [col, tipo] of colsRef) {
        if (!colsNovo.has(col)) {
          colsFaltando.push(`${tab}.${col}`)
        } else if (colsNovo.get(col) !== tipo) {
          colsDiferentes.push(`${tab}.${col} — novo ${colsNovo.get(col)} · ref ${tipo}`)
        }
      }
    }

    console.log(`\nCOLUNAS`)
    if (colsFaltando.length === 0 && colsDiferentes.length === 0) {
      console.log('  OK — nenhuma coluna faltando, nenhum tipo divergente.')
    }
    if (colsFaltando.length > 0) {
      problemas.push(`${colsFaltando.length} coluna(s) faltando`)
      console.log(`\n  FALTANDO NO NOVO — ${colsFaltando.length}:`)
      for (const x of colsFaltando.slice(0, 40)) console.log(`     ${x}`)
      if (colsFaltando.length > 40) console.log(`     ... e mais ${colsFaltando.length - 40}`)
    }
    if (colsDiferentes.length > 0) {
      problemas.push(`${colsDiferentes.length} coluna(s) com tipo diferente`)
      console.log(`\n  TIPO DIVERGENTE — ${colsDiferentes.length}:`)
      for (const x of colsDiferentes.slice(0, 40)) console.log(`     ${x}`)
      if (colsDiferentes.length > 40) console.log(`     ... e mais ${colsDiferentes.length - 40}`)
    }

    // ── Sequences apontando para fora ───────────────────────────────────────
    //
    // O erro mais perigoso do clone: coluna do schema novo puxando numeracao da
    // origem. Nao da erro — da dois clientes na mesma sequencia.
    const fora = await c.query(`
      SELECT table_name, column_name, column_default
        FROM information_schema.columns
       WHERE table_schema = $1 AND column_default LIKE 'nextval%'
         AND column_default NOT LIKE $2
    `, [NOVO, `%${NOVO}%`])

    console.log(`\nSEQUENCES APONTANDO PARA FORA DO SCHEMA — ${fora.rows.length}`)
    if (fora.rows.length === 0) {
      console.log('  OK — nenhuma. Cada tabela numera a propria.')
    } else {
      problemas.push(`${fora.rows.length} sequence(s) apontando para fora`)
      console.log('  PROBLEMA GRAVE — estas colunas puxam id de outro schema:')
      for (const r of fora.rows) console.log(`     ${r.table_name}.${r.column_name} -> ${r.column_default}`)
    }

    // ── Semente ─────────────────────────────────────────────────────────────
    console.log('\nSEMENTE NO SCHEMA NOVO')
    for (const t of ['t_perfil_acesso', 't_dominio', 't_dominio_valor', 't_forma_pagamento', 't_configuracoes_tenant', 't_usuario']) {
      if (!tNovo.includes(t)) { console.log(`  ${t}: tabela nao existe`); continue }
      const n = await c.query(`SELECT COUNT(*)::int AS n FROM "${NOVO}"."${t}"`)
      const marca = n.rows[0].n === 0 ? '  <- VAZIA' : ''
      console.log(`  ${t.padEnd(24)} ${String(n.rows[0].n).padStart(4)}${marca}`)
      if (n.rows[0].n === 0 && ['t_configuracoes_tenant', 't_usuario', 't_forma_pagamento'].includes(t)) {
        problemas.push(`${t} vazia`)
      }
    }

    // ── Veredito ────────────────────────────────────────────────────────────
    console.log(`\n${'─'.repeat(72)}`)
    if (problemas.length === 0) {
      console.log('VEREDITO: estrutura equivalente. Pode navegar o sistema para o teste funcional.')
    } else {
      console.log('VEREDITO: corrigir antes de usar —')
      for (const p of problemas) console.log(`   · ${p}`)
    }
    console.log('')
  } finally {
    c.release()
    await pool.end()
  }
}

main().catch(err => { console.error('\nERRO:', err.message); process.exit(1) })
