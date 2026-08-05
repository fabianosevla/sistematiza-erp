// scripts/fix-vinculo-clerk.js
//
// CORRIGE OS clerk_id TROCADOS.
//
// O que check-clerk-usuarios.js provou:
//
//   t_usuario id 1  "Sistematiza Suporte"  sistematizaai@gmail.com
//       guardava clerk_id = user_3Eh8XVHTMdbZI7a8CYzu7Ikv7OQ
//       ...que no Clerk pertence a fabiano.halves02@gmail.com
//
//   t_usuario id 8  "Fabiano Henrique Alves"  fabiano.halves02@gmail.com
//       guardava clerk_id = pending_fabiano_halves02_gmail_com
//       ...embora a conta dele exista e logue normalmente
//
// Efeito: ao entrar com fabiano.halves02, a busca por clerk_id casava com a
// linha 1 e o sistema o tratava como "Sistematiza Suporte". A linha 8 nunca
// era alcançada — o trecho que cura o "pending_" pelo e-mail só roda quando a
// busca por clerk_id NÃO acha nada, e aqui ela achava (a linha errada).
//
// A troca devolve cada ID ao seu dono:
//   id 1 → user_3F9YbpYUVNnXHyhT5jIEWYa1AYI  (conta real do sistematizaai)
//   id 8 → user_3Eh8XVHTMdbZI7a8CYzu7Ikv7OQ  (conta real do fabiano.halves02)
//
// Maria Julia (id 3) NÃO é tocada: por decisão do Fabiano, o e-mail válido
// dela continua sendo o hotmail, e o vínculo acontecerá quando ela aceitar o
// convite.
//
// USO — simula por padrão, só grava com --aplicar:
//
//   node scripts/fix-vinculo-clerk.js              (mostra o que faria)
//   node scripts/fix-vinculo-clerk.js --aplicar    (grava)
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

const APLICAR = process.argv.includes('--aplicar')
const SCHEMA  = 'tenant_zaghi_massas_caseiras'

// usuario_id → clerk_id correto, com o e-mail que comprova a titularidade.
const CORRECOES = [
  { usuarioId: 1, email: 'sistematizaai@gmail.com',    clerkId: 'user_3F9YbpYUVNnXHyhT5jIEWYa1AYI' },
  { usuarioId: 8, email: 'fabiano.halves02@gmail.com', clerkId: 'user_3Eh8XVHTMdbZI7a8CYzu7Ikv7OQ' },
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
    await c.query(`SET search_path TO "${SCHEMA}", public`)

    console.log(APLICAR ? '\n>>> MODO GRAVACAO\n' : '\n>>> SIMULACAO — nada sera gravado. Use --aplicar para valer.\n')

    const antes = await c.query(
      `SELECT usuario_id, nome, email, clerk_id, perfil_id FROM t_usuario ORDER BY usuario_id`
    )
    console.log('ANTES:')
    console.table(antes.rows)

    // Confere se o e-mail bate antes de mexer: se alguém já corrigiu na mão,
    // o script não pode gravar por cima às cegas.
    const planejado = []
    for (const alvo of CORRECOES) {
      const linha = antes.rows.find(r => Number(r.usuario_id) === alvo.usuarioId)
      if (!linha) {
        console.log(`\n  ! id ${alvo.usuarioId} nao existe — ignorado`)
        continue
      }
      if (String(linha.email).trim().toLowerCase() !== alvo.email) {
        console.log(`\n  ! id ${alvo.usuarioId} tem e-mail "${linha.email}", esperado "${alvo.email}" — ignorado por seguranca`)
        continue
      }
      if (linha.clerk_id === alvo.clerkId) {
        console.log(`\n  = id ${alvo.usuarioId} (${alvo.email}) ja esta correto`)
        continue
      }
      planejado.push({ ...alvo, de: linha.clerk_id, nome: linha.nome })
    }

    if (planejado.length === 0) {
      console.log('\nNada a fazer.')
      return
    }

    console.log('\nMUDANCAS:')
    for (const p of planejado) {
      console.log(`  id ${p.usuarioId} · ${p.nome} · ${p.email}`)
      console.log(`      de:   ${p.de}`)
      console.log(`      para: ${p.clerkId}`)
    }

    if (!APLICAR) {
      console.log('\nSimulacao encerrada. Rode com --aplicar para gravar.')
      return
    }

    // Transação: ou os dois vínculos ficam certos, ou nenhum muda. Um estado
    // intermediário deixaria dois registros com o mesmo clerk_id.
    await c.query('BEGIN')
    try {
      for (const p of planejado) {
        await c.query(
          `UPDATE t_usuario SET clerk_id = $1, updated_dt = NOW() WHERE usuario_id = $2`,
          [p.clerkId, p.usuarioId]
        )
      }
      await c.query('COMMIT')
    } catch (e) {
      await c.query('ROLLBACK')
      throw e
    }

    const depois = await c.query(
      `SELECT usuario_id, nome, email, clerk_id, perfil_id FROM t_usuario ORDER BY usuario_id`
    )
    console.log('\nDEPOIS:')
    console.table(depois.rows)

    // Nenhum clerk_id real pode aparecer duas vezes.
    const reais = depois.rows.filter(r => !String(r.clerk_id ?? '').startsWith('pending'))
    const vistos = new Map()
    let colisao = false
    for (const r of reais) {
      if (vistos.has(r.clerk_id)) {
        console.log(`\n  !! COLISAO: clerk_id ${r.clerk_id} em ${vistos.get(r.clerk_id)} e ${r.usuario_id}`)
        colisao = true
      }
      vistos.set(r.clerk_id, r.usuario_id)
    }
    console.log(colisao ? '\nATENCAO: ha clerk_id repetido.' : '\nOk — nenhum clerk_id repetido.')
    console.log('Saia do sistema e entre de novo para a sessao pegar o vinculo novo.')
  } finally {
    c.release()
    await pool.end()
  }
}

main().catch(err => { console.error('\nERRO:', err.message); process.exit(1) })
