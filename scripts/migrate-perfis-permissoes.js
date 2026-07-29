// scripts/migrate-perfis-permissoes.js
//
// URGENTE — conserta o 500 dos Perfis de Acesso.
//
// A tabela t_perfil_acesso está sem quatro colunas que o código lê e grava:
//   modulo_compras, pode_criar, pode_editar, pode_excluir
//
// Consequências que isso causava:
//   - criar/editar perfil → 500 (INSERT/UPDATE em coluna inexistente)
//   - listar perfis → 500 também, então a tela mostrava "nenhum perfil"
//     mesmo com 4 gravados no banco
//
// O que o script faz:
//   1. cria as quatro colunas (BOOLEAN NOT NULL DEFAULT false);
//   2. dá permissão total a quem é is_admin — sem isso o administrador
//      ficaria sem poder criar nada, porque o default é false;
//   3. aponta usuários com perfil_id inválido (0 ou apontando para perfil
//      que não existe), que é o caso de quem "loga e não vê nada".
//
// Idempotente.
//
//   node scripts/migrate-perfis-permissoes.js            → simula
//   node scripts/migrate-perfis-permissoes.js --apply    → aplica
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

const APLICAR = process.argv.includes('--apply')

const COLUNAS = [
  ['modulo_compras', 'BOOLEAN NOT NULL DEFAULT false'],
  ['pode_criar',     'BOOLEAN NOT NULL DEFAULT false'],
  ['pode_editar',    'BOOLEAN NOT NULL DEFAULT false'],
  ['pode_excluir',   'BOOLEAN NOT NULL DEFAULT false'],
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
         WHERE table_schema = $1 AND table_name = 't_perfil_acesso'`,
        [schema]
      )
      if (cols.length === 0) {
        console.log('   t_perfil_acesso não existe — pulando')
        continue
      }
      const existentes = new Set(cols.map(c => c.column_name))

      // 1. Colunas
      let criouAlguma = false
      for (const [col, tipo] of COLUNAS) {
        if (existentes.has(col)) {
          console.log(`   já existe: ${col}`)
          continue
        }
        console.log(`   criar:     ${col}`)
        criouAlguma = true
        if (APLICAR) {
          await client.query(
            `ALTER TABLE "${schema}".t_perfil_acesso ADD COLUMN IF NOT EXISTS ${col} ${tipo}`
          )
        }
      }

      // 2. Admin recebe permissão total. O default é false, então sem isto o
      //    perfil Administrador nasceria sem poder criar, editar nem excluir.
      console.log('   ajustar:   is_admin → pode_criar/editar/excluir = true, modulo_compras = true')
      if (APLICAR) {
        await client.query(`
          UPDATE "${schema}".t_perfil_acesso
          SET pode_criar   = true,
              pode_editar  = true,
              pode_excluir = true,
              modulo_compras = true,
              updated_dt   = NOW()
          WHERE is_admin = true
        `)
      }

      // 3. Usuários com perfil inválido
      const { rows: orfaos } = await client.query(`
        SELECT u.usuario_id, u.nome, u.email, u.perfil_id
        FROM "${schema}".t_usuario u
        WHERE u.active_flg = true
          AND (
            u.perfil_id IS NULL
            OR u.perfil_id = 0
            OR NOT EXISTS (
              SELECT 1 FROM "${schema}".t_perfil_acesso p
              WHERE p.perfil_id = u.perfil_id
            )
          )
      `)

      if (orfaos.length > 0) {
        console.log(`\n   ${orfaos.length} usuário(s) SEM perfil válido — logam e não veem nada:`)
        for (const u of orfaos) {
          console.log(`     #${u.usuario_id} ${u.nome} <${u.email}>  perfil_id=${u.perfil_id ?? 'NULL'}`)
        }
        console.log('\n   Estes o script NÃO altera: escolher perfil é decisão sua.')
        console.log('   Depois de rodar com --apply, a tela de Usuários volta a funcionar')
        console.log('   e você atribui o perfil correto a cada um.\n')
      } else {
        console.log('   todos os usuários ativos têm perfil válido')
      }
    }

    console.log(APLICAR ? '\nConcluído.' : '\nSimulação concluída. Rode com --apply para gravar.')
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch(err => { console.error(err); process.exit(1) })