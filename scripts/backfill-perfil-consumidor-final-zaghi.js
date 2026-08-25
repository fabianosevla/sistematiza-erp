// scripts/backfill-perfil-consumidor-final-zaghi.js
//
// Preenche perfil_trib_consumidor_final_id nos produtos da Zaghi que hoje
// só têm perfil_trib_id = 1 ("Massa com ST - venda a contribuinte").
//
// O par certo é o perfil 2 ("Massa com ST - venda a consumidor final") —
// confirmado pela Focus NFe no payload de teste (CFOP 5405, CSOSN 500).
// Só roda no tenant da Zaghi: os outros schemas são demo/teste, sem produto
// real para essa mudança valer.
//
//   node scripts/backfill-perfil-consumidor-final-zaghi.js            (simula)
//   node scripts/backfill-perfil-consumidor-final-zaghi.js --aplicar  (grava)
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

const APLICAR = process.argv.includes('--aplicar')
const SCHEMA  = 'tenant_zaghi_massas_caseiras'
const PERFIL_ORIGEM  = 1
const PERFIL_DESTINO = 2

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

async function main() {
  const pool = new Pool(conexao())
  const c    = await pool.connect()

  try {
    await c.query(`SET search_path TO "${SCHEMA}", public`)

    const { rows: alvo } = await c.query(`
      SELECT produto_id, nome FROM t_produto
       WHERE perfil_trib_id = $1 AND active_flg = true
       ORDER BY nome
    `, [PERFIL_ORIGEM])

    console.log(APLICAR ? '\n>>> MODO GRAVACAO\n' : '\n>>> SIMULACAO — nada sera gravado. Use --aplicar.\n')
    console.log(`${alvo.length} produto(s) em perfil_trib_id=${PERFIL_ORIGEM} vao receber perfil_trib_consumidor_final_id=${PERFIL_DESTINO}:`)
    for (const p of alvo) console.log(`  - ${p.nome}`)

    if (!APLICAR) {
      console.log('\nNada foi gravado. Rode com --aplicar.')
      return
    }

    const res = await c.query(`
      UPDATE t_produto SET perfil_trib_consumidor_final_id = $1
       WHERE perfil_trib_id = $2 AND active_flg = true
    `, [PERFIL_DESTINO, PERFIL_ORIGEM])
    console.log(`\nOK — ${res.rowCount} produto(s) atualizado(s).`)
  } finally {
    c.release()
    await pool.end()
  }
}

main().catch(err => { console.error('\nERRO:', err.message); process.exit(1) })
