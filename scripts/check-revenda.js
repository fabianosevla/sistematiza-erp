// scripts/check-revenda.js
//
// Diagnóstico SOMENTE LEITURA da flag de revenda.
//
// A rota GET devolve  revenda = (coluna revenda) OU (tipo = 'Revenda')
// e a tela marca a caixa pela mesma regra. Consequência: num produto que
// tenha tipo = 'Revenda', a caixa é recalculada como marcada a cada carga,
// não importa o que esteja gravado na coluna. Desmarcar grava false, o F5
// relê, o fallback pelo tipo devolve true — e a caixa volta sozinha.
//
// Este script mostra quais produtos estão nessa situação.
//
//   node scripts/check-revenda.js
//   node scripts/check-revenda.js --tenant tenant_outro
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

const argv   = process.argv.slice(2)
const iTen   = argv.indexOf('--tenant')
const TENANT = iTen >= 0 ? argv[iTen + 1] : 'tenant_zaghi_massas_caseiras'

// O .env.local do projeto guarda a conexão em partes (DB_HOST, DB_PORT, ...),
// não como DATABASE_URL. Aceita as duas formas.
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

    const { rows: cols } = await client.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = 't_produto'`,
      [TENANT]
    )
    const temColunaRevenda = cols.some(c => c.column_name === 'revenda')
    console.log(`\nschema: ${TENANT}`)
    console.log(`coluna t_produto.revenda existe? ${temColunaRevenda ? 'sim' : 'NÃO — a migration de revenda não rodou aqui'}\n`)
    if (!temColunaRevenda) return

    const { rows } = await client.query(`
      SELECT produto_id, nome, tipo, revenda, active_flg
      FROM t_produto
      WHERE tipo = 'Revenda' OR revenda = true
      ORDER BY nome
    `)

    if (rows.length === 0) { console.log('Nenhum produto marcado como revenda.\n'); return }

    console.table(rows.map(r => ({
      id:      r.produto_id,
      nome:    r.nome,
      tipo:    r.tipo ?? '',
      revenda: r.revenda,
      ativo:   r.active_flg,
      diagnostico:
        r.tipo === 'Revenda' && r.revenda === false
          ? 'TRAVADO — desmarcar não tem efeito'
          : r.tipo === 'Revenda'
            ? 'travaria se você desmarcar'
            : 'ok, desmarca normal',
    })))

    const travados = rows.filter(r => r.tipo === 'Revenda')
    if (travados.length > 0) {
      console.log(`\n${travados.length} produto(s) com tipo = 'Revenda'.`)
      console.log('Enquanto o tipo for esse, a caixa volta sozinha por causa do fallback.\n')
      console.log('Correção de dados (rode só depois de conferir a lista acima):\n')
      console.log(`  UPDATE "${TENANT}".t_produto`)
      console.log(`  SET tipo = NULL`)
      console.log(`  WHERE tipo = 'Revenda';\n`)
      console.log('O tipo real do produto (Bebida, Massa…) você redefine no cadastro.')
      console.log('A informação de revenda continua na coluna própria.\n')
    }
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch(err => { console.error(err); process.exit(1) })