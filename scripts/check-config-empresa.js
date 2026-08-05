// scripts/check-config-empresa.js
//
// POR QUE "NOME FANTASIA" NÃO SALVA.
//
// A rota PUT /api/[tenant]/configuracoes só grava em coluna que existe de
// fato em t_configuracoes_tenant:
//
//     if (val !== undefined && existe.has(col)) { UPDATE ... }
//
// O guarda é proposital — protege tenant que ainda não rodou as migrations.
// O defeito é que ele pulava em SILÊNCIO: a tela dizia "salvo", e o campo
// voltava vazio.
//
// Este script mostra, por tenant, quais colunas de dados da empresa existem,
// quais faltam, e o que está gravado hoje. Só lê.
//
//   node scripts/check-config-empresa.js
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

// Exatamente os campos que a aba "Configurações de conta" tenta gravar.
const ESPERADAS = [
  'nome_empresa', 'nome_fantasia', 'cnpj', 'inscricao_estadual',
  'inscricao_municipal', 'telefone', 'email', 'cep', 'endereco',
  'numero', 'complemento', 'bairro', 'cidade', 'uf', 'mensagem_cupom',
]

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
    const { rows: schemas } = await c.query(`
      SELECT schema_name FROM information_schema.schemata
      WHERE schema_name LIKE 'tenant\\_%' ESCAPE '\\' ORDER BY schema_name
    `)

    for (const { schema_name: schema } of schemas) {
      console.log(`\n${'═'.repeat(70)}\n${schema}\n${'═'.repeat(70)}`)
      await c.query(`SET search_path TO "${schema}", public`)

      const { rows: cols } = await c.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 't_configuracoes_tenant'
      `, [schema])

      if (cols.length === 0) {
        console.log('  t_configuracoes_tenant NAO EXISTE neste schema.')
        continue
      }

      const existe   = new Set(cols.map(r => r.column_name))
      const faltando = ESPERADAS.filter(c2 => !existe.has(c2))

      if (faltando.length === 0) {
        console.log('\n  Todas as colunas de empresa existem.')
      } else {
        console.log('\n  COLUNAS AUSENTES — tudo que for digitado nelas e descartado em silencio:')
        for (const f of faltando) console.log(`     ${f}`)
        console.log('\n  Correcao:  node scripts/migrate-empresa-dados.js')
      }

      // Valores atuais, só das colunas que existem.
      const presentes = ESPERADAS.filter(c2 => existe.has(c2))
      if (presentes.length > 0) {
        const { rows } = await c.query(
          `SELECT ${presentes.join(', ')} FROM t_configuracoes_tenant LIMIT 1`
        )
        console.log('\n  VALORES GRAVADOS HOJE:')
        const r = rows[0] ?? {}
        for (const campo of presentes) {
          const v = r[campo]
          console.log(`     ${campo.padEnd(22)} ${v === null || v === '' ? '(vazio)' : v}`)
        }
      }
    }
  } finally {
    c.release()
    await pool.end()
  }
}

main().catch(err => { console.error('\nERRO:', err.message); process.exit(1) })
