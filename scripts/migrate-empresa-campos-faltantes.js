// scripts/migrate-empresa-campos-faltantes.js
//
// AS QUATRO COLUNAS QUE NINGUÉM CRIOU.
//
// scripts/migrate-empresa-dados.js foi escrito com esta premissa, no próprio
// comentário dele:
//
//     "Já existiam: nome_empresa, nome_fantasia, cnpj, telefone, email,
//      endereco, cidade, uf, cep."
//
// A premissa estava errada. No tenant da Zaghi faltam nome_fantasia, email,
// cep e cidade — e como a rota PUT de configurações só grava em coluna que
// existe, tudo que era digitado nesses quatro campos era descartado sem erro
// nenhum: a tela dizia "salvo" e o valor voltava vazio.
//
// Este script não assume nada. Ele lê o schema, compara com a lista completa
// de campos que a aba "Configurações de conta" tenta gravar, e cria o que
// faltar. Rodar de novo depois não faz mal — só reporta que está tudo certo.
//
//   node scripts/migrate-empresa-campos-faltantes.js            (simula)
//   node scripts/migrate-empresa-campos-faltantes.js --aplicar  (grava)
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

const APLICAR = process.argv.includes('--aplicar')

// Espelha CAMPOS_EMPRESA em components/layout/Header.tsx e a lista de
// updates em app/api/[tenant]/configuracoes/route.ts. Se um campo novo for
// acrescentado lá, acrescente aqui também.
const COLUNAS = [
  ['nome_empresa',        'VARCHAR(200)'],
  ['nome_fantasia',       'VARCHAR(200)'],
  ['cnpj',                'VARCHAR(20)'],
  ['inscricao_estadual',  'VARCHAR(30)'],
  ['inscricao_municipal', 'VARCHAR(30)'],
  ['telefone',            'VARCHAR(20)'],
  ['email',               'VARCHAR(150)'],
  ['cep',                 'VARCHAR(15)'],
  ['endereco',            'VARCHAR(200)'],
  ['numero',              'VARCHAR(20)'],
  ['complemento',         'VARCHAR(100)'],
  ['bairro',              'VARCHAR(100)'],
  ['cidade',              'VARCHAR(100)'],
  ['uf',                  'VARCHAR(2)'],
  ['mensagem_cupom',      'VARCHAR(200)'],
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

    console.log(APLICAR ? '\n>>> MODO GRAVACAO\n' : '\n>>> SIMULACAO — nada sera gravado. Use --aplicar.\n')

    for (const { schema_name: schema } of schemas) {
      console.log(`\n── ${schema}`)
      await c.query(`SET search_path TO "${schema}", public`)

      const { rows: cols } = await c.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 't_configuracoes_tenant'
      `, [schema])

      if (cols.length === 0) {
        console.log('   t_configuracoes_tenant NAO EXISTE — pulando.')
        continue
      }

      const existe   = new Set(cols.map(r => r.column_name))
      const faltando = COLUNAS.filter(([col]) => !existe.has(col))

      if (faltando.length === 0) {
        console.log('   Nada a fazer — todas as colunas existem.')
        continue
      }

      for (const [col, tipo] of faltando) console.log(`   falta: ${col} (${tipo})`)

      if (!APLICAR) continue

      // Transação: ou entram todas, ou nenhuma. Meia migration deixaria o
      // mesmo problema em outro campo.
      await c.query('BEGIN')
      try {
        for (const [col, tipo] of faltando) {
          await c.query(`ALTER TABLE t_configuracoes_tenant ADD COLUMN IF NOT EXISTS ${col} ${tipo}`)
        }
        await c.query('COMMIT')
        console.log(`   OK — ${faltando.length} coluna(s) criada(s).`)
      } catch (e) {
        await c.query('ROLLBACK')
        console.log(`   ERRO: ${e.message}`)
        throw e
      }
    }

    if (!APLICAR) console.log('\nSimulacao encerrada. Rode com --aplicar para gravar.')
    else console.log('\nPronto. Abra Configuracoes, preencha os campos e clique em Salvar.')
  } finally {
    c.release()
    await pool.end()
  }
}

main().catch(err => { console.error('\nERRO:', err.message); process.exit(1) })
