// scripts/parametrizar-fidelidade-zaghi.js
//
// Fidelidade da Zaghi pela pesquisa de mercado enviada pela QA (cartão
// "image.png", QA #121). A pesquisa enquadra "Restaurantes, lanchonetes e
// delivery" em 5% a 10% de cashback: 5% como mínimo para atrair e reter,
// 10% como padrão de alto engajamento. Fabiano escolheu 5% (25/09/2026).
//
// Só o percentual de cashback muda. Se o tenant ainda não tem configuração,
// cria a linha com o percentual e o resto no padrão do sistema. Não liga nem
// desliga o programa (programa_ativo fica como está).
//
//   node scripts/parametrizar-fidelidade-zaghi.js            (simula)
//   node scripts/parametrizar-fidelidade-zaghi.js --aplicar  (grava)
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

const APLICAR  = process.argv.includes('--aplicar')
const SCHEMA   = 'tenant_zaghi_massas_caseiras'
const CASHBACK = 500   // basis points: 500 = 5,00%

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

const pct = bp => `${(Number(bp) / 100).toFixed(2).replace('.', ',')}%`

async function main() {
  const pool = new Pool(conexao())
  const c    = await pool.connect()
  try {
    await c.query(`SET search_path TO "${SCHEMA}", public`)
    console.log(APLICAR ? '\n>>> MODO GRAVACAO\n' : '\n>>> SIMULACAO — nada sera gravado. Use --aplicar.\n')

    const { rows } = await c.query(`
      SELECT config_id, programa_ativo, cashback_pct_bp
        FROM t_fidelidade_config WHERE active_flg = true
       ORDER BY config_id LIMIT 1
    `)
    const atual = rows[0]

    if (atual) {
      console.log(`  Configuracao existente #${atual.config_id}`)
      console.log(`  Programa ativo: ${atual.programa_ativo ? 'sim' : 'nao'} (nao sera alterado)`)
      console.log(`  Cashback: ${pct(atual.cashback_pct_bp)} -> ${pct(CASHBACK)}`)
      if (Number(atual.cashback_pct_bp) === CASHBACK) { console.log('\n  Ja esta em 5%. Nada a fazer.'); return }
      if (!APLICAR) return
      await c.query(`
        UPDATE t_fidelidade_config
           SET cashback_pct_bp = $1, updated_dt = NOW(), modification_num = modification_num + 1
         WHERE config_id = $2
      `, [CASHBACK, atual.config_id])
    } else {
      console.log('  Sem configuracao de fidelidade. Seria criada com cashback de 5% e o resto no padrao.')
      console.log('  Programa ativo: nao (ligue em Fidelidade quando quiser comecar).')
      if (!APLICAR) return
      await c.query(`INSERT INTO t_fidelidade_config (cashback_pct_bp) VALUES ($1)`, [CASHBACK])
    }
    console.log('\n  OK — gravado.')
  } finally {
    c.release()
    await pool.end()
  }
}

main().catch(err => { console.error('\nERRO:', err.message); process.exit(1) })
