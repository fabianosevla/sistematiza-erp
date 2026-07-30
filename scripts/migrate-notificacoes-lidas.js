// scripts/migrate-notificacoes-lidas.js
//
// Cria t_notificacao_lida em cada tenant.
//
// Contexto: as notificações não existem como registro. São calculadas na hora
// pela rota (estoque abaixo do mínimo, plano de ação pendente) e nasciam
// sempre com lida = false — por isso nunca saíam do sino.
//
// Esta tabela guarda o que cada usuário já viu. Duas colunas fazem o trabalho:
//
//   notif_key   → identidade do alerta   (ex.: "insumo-42")
//   assinatura  → texto da mensagem lida (ex.: "Farinha está com 3 (mín. 10)")
//
// A leitura só vale enquanto a mensagem for a mesma. Se a farinha cair de
// 3 kg para 1 kg, o texto muda, a assinatura não bate mais e o alerta volta
// a aparecer como novo — que é o comportamento desejado: marcar como lido não
// pode silenciar um problema que piorou.
//
// Idempotente.
//
//   node scripts/migrate-notificacoes-lidas.js            → simula
//   node scripts/migrate-notificacoes-lidas.js --apply    → aplica
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

const APLICAR = process.argv.includes('--apply')

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

      const { rows: existe } = await client.query(
        `SELECT 1 FROM information_schema.tables
         WHERE table_schema = $1 AND table_name = 't_notificacao_lida'`,
        [schema]
      )

      if (existe.length > 0) {
        console.log('   já existe: t_notificacao_lida')
      } else {
        console.log('   criar:     t_notificacao_lida')
        if (APLICAR) {
          await client.query(`
            CREATE TABLE IF NOT EXISTS "${schema}".t_notificacao_lida (
              lida_id      SERIAL PRIMARY KEY,
              usuario_ref  VARCHAR(120) NOT NULL,
              notif_key    VARCHAR(120) NOT NULL,
              assinatura   TEXT         NOT NULL,
              lida_dt      TIMESTAMP    NOT NULL DEFAULT NOW()
            )
          `)
        }
      }

      // Uma linha por usuário e por alerta. O índice único é o que permite
      // o ON CONFLICT DO UPDATE da rota — sem ele a tabela cresceria sem fim.
      console.log('   garantir:  índice único (usuario_ref, notif_key)')
      if (APLICAR) {
        await client.query(`
          CREATE UNIQUE INDEX IF NOT EXISTS ux_notificacao_lida_usuario_key
          ON "${schema}".t_notificacao_lida (usuario_ref, notif_key)
        `)
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