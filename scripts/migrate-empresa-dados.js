// scripts/migrate-empresa-dados.js
//
// Completa os dados cadastrais da empresa em t_configuracoes_tenant.
//
// Já existiam: nome_empresa, nome_fantasia, cnpj, telefone, email, endereco,
// cidade, uf, cep.
//
// Faltavam os campos que um cupom ou documento comercial precisa para ficar
// completo: inscrição estadual, número, bairro e complemento do endereço.
//
// Nenhum valor é preenchido — cada empresa informa os seus na tela de
// Configurações. Campos vazios simplesmente não são impressos no cupom.
//
// Idempotente.
//
//   node scripts/migrate-empresa-dados.js            → simula
//   node scripts/migrate-empresa-dados.js --apply    → aplica
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

const APLICAR = process.argv.includes('--apply')

const COLUNAS = [
  ['inscricao_estadual', 'VARCHAR(30)'],
  ['inscricao_municipal', 'VARCHAR(30)'],
  ['numero',              'VARCHAR(20)'],
  ['bairro',              'VARCHAR(100)'],
  ['complemento',         'VARCHAR(100)'],
  // Mensagem livre impressa no rodapé do cupom (ex.: "Trocas em até 7 dias")
  ['mensagem_cupom',      'VARCHAR(200)'],
]

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
    const { rows: schemas } = await client.query(`
      SELECT schema_name FROM information_schema.schemata
      WHERE schema_name LIKE 'tenant\\_%' ESCAPE '\\'
      ORDER BY schema_name
    `)

    console.log(`${schemas.length} tenant(s)${APLICAR ? '' : ' — SIMULAÇÃO, nada será gravado'}\n`)

    for (const { schema_name: schema } of schemas) {
      console.log(`── ${schema}`)

      const { rows: cols } = await client.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = 't_configuracoes_tenant'`,
        [schema]
      )
      if (cols.length === 0) {
        console.log('   t_configuracoes_tenant não existe — pulando')
        continue
      }
      const existentes = new Set(cols.map(c => c.column_name))

      for (const [col, tipo] of COLUNAS) {
        if (existentes.has(col)) {
          console.log(`   já existe: ${col}`)
          continue
        }
        console.log(`   criar:     ${col} ${tipo}`)
        if (APLICAR) {
          await client.query(
            `ALTER TABLE "${schema}".t_configuracoes_tenant ADD COLUMN IF NOT EXISTS ${col} ${tipo}`
          )
        }
      }

      // Garante que exista a linha única de configuração — sem ela a tela
      // salva e nada acontece, porque o UPDATE não encontra registro.
      const { rows: temLinha } = await client.query(
        `SELECT COUNT(*)::int AS total FROM "${schema}".t_configuracoes_tenant`
      )
      if (Number(temLinha[0]?.total ?? 0) === 0) {
        console.log('   criar:     linha inicial de configuração')
        if (APLICAR) {
          await client.query(`
            INSERT INTO "${schema}".t_configuracoes_tenant
              (created_dt, created_by, updated_dt, updated_by, active_flg, modification_num)
            VALUES (NOW(), 1, NOW(), 1, true, 0)
          `)
        }
      }

      if (APLICAR) {
        const { rows: dados } = await client.query(`
          SELECT nome_empresa, cnpj, inscricao_estadual, telefone, endereco, cidade, uf
          FROM "${schema}".t_configuracoes_tenant LIMIT 1
        `)
        const d = dados[0] ?? {}
        const faltando = Object.entries({
          'Nome da empresa':     d.nome_empresa,
          'CNPJ':                d.cnpj,
          'Inscrição estadual':  d.inscricao_estadual,
          'Telefone':            d.telefone,
          'Endereço':            d.endereco,
          'Cidade':              d.cidade,
          'UF':                  d.uf,
        }).filter(([, v]) => !String(v ?? '').trim()).map(([k]) => k)

        if (faltando.length > 0) {
          console.log(`\n   Preencher em Configurações → Dados da empresa:`)
          for (const f of faltando) console.log(`     ${f}`)
        } else {
          console.log('   dados da empresa completos')
        }
      }
      console.log('')
    }

    console.log(APLICAR ? 'Concluído.' : 'Simulação concluída. Rode com --apply para gravar.')
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch(err => { console.error(err); process.exit(1) })