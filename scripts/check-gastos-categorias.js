// scripts/check-gastos-categorias.js
//
// Diagnóstico SOMENTE LEITURA das categorias de Gasto Fixo.
//
// Investiga o "já existe essa categoria" em nomes que não aparecem na tela.
// Duas causas possíveis:
//   1. categoria inativa (active_flg = false) ainda ocupando o nome — a grade
//      não a mostra, mas a validação a encontra;
//   2. constraint UNIQUE no banco devolvendo erro 23505.
//
//   node scripts/check-gastos-categorias.js
//   node scripts/check-gastos-categorias.js --tenant tenant_outro
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

const argv   = process.argv.slice(2)
const iTen   = argv.indexOf('--tenant')
const TENANT = iTen >= 0 ? argv[iTen + 1] : 'tenant_zaghi_massas_caseiras'

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
  const pool   = new Pool(conexao())
  const client = await pool.connect()

  try {
    await client.query(`SET search_path TO "${TENANT}", public`)
    console.log(`\nschema: ${TENANT}\n`)

    // ── Colunas ────────────────────────────────────────────────────────────
    const { rows: cols } = await client.query(
      `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = 't_gasto_fixo_categoria'
       ORDER BY ordinal_position`,
      [TENANT]
    )
    if (cols.length === 0) {
      console.log('t_gasto_fixo_categoria não existe neste schema.\n')
      return
    }
    console.log('── Colunas')
    console.table(cols.map(c => ({ coluna: c.column_name, tipo: c.data_type, nulo: c.is_nullable })))

    // ── Todas as categorias, ativas e inativas ─────────────────────────────
    const { rows: cats } = await client.query(`
      SELECT categoria_id, nome, ordem, active_flg, created_dt
      FROM t_gasto_fixo_categoria
      ORDER BY nome
    `)
    console.log(`\n── Categorias — ${cats.length} no total`)
    console.table(cats.map(c => ({
      id:     c.categoria_id,
      nome:   c.nome,
      ordem:  c.ordem,
      ativa:  c.active_flg,
      obs:    c.active_flg ? '' : 'INATIVA — invisível na grade, mas ocupa o nome',
    })))

    const inativas = cats.filter(c => !c.active_flg)
    if (inativas.length > 0) {
      console.log(`\n   ${inativas.length} categoria(s) inativa(s). Se o nome que você tentou criar`)
      console.log('   está nessa lista, é essa a causa do "já existe".\n')
    }

    // ── Nomes duplicados ignorando maiúsculas e espaços ────────────────────
    const { rows: dups } = await client.query(`
      SELECT LOWER(TRIM(nome)) AS chave, COUNT(*)::int AS qtd,
             STRING_AGG(categoria_id || ':' || nome || ':' || active_flg, ' | ') AS registros
      FROM t_gasto_fixo_categoria
      GROUP BY LOWER(TRIM(nome))
      HAVING COUNT(*) > 1
    `)
    if (dups.length > 0) {
      console.log('── Nomes repetidos no banco')
      console.table(dups)
    }

    // ── Constraints ────────────────────────────────────────────────────────
    const { rows: cons } = await client.query(`
      SELECT c.conname AS nome, pg_get_constraintdef(c.oid) AS definicao
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = $1 AND t.relname = 't_gasto_fixo_categoria'
      ORDER BY c.conname
    `, [TENANT])
    console.log('\n── Constraints da tabela')
    if (cons.length === 0) {
      console.log('   nenhuma além da chave primária implícita')
    } else {
      console.table(cons)
      const unicas = cons.filter(c => /UNIQUE/i.test(c.definicao))
      if (unicas.length > 0) {
        console.log('\n   Há constraint UNIQUE. Se ela não considera active_flg, uma categoria')
        console.log('   excluída logicamente continua bloqueando o nome para sempre.\n')
      }
    }

    console.log('')
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch(err => { console.error(err); process.exit(1) })