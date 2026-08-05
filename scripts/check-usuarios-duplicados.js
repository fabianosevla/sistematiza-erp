// scripts/check-usuarios-duplicados.js
//
// TRÊS SINTOMAS, PROVAVELMENTE UMA CAUSA SÓ.
//
//   1. fabiano.halves02@gmail.com loga e o sistema o chama de "Sistematiza Suporte"
//   2. esse mesmo e-mail aparece como convite pendente
//   3. perfil de admin da Maria Julia não sobrevive a um F5
//
// A hipótese: existe mais de uma linha em t_usuario representando a mesma
// pessoa. Uma com o clerk_id real, outra com "pending_<email>". Tanto
// usuarioAtualId() quanto PerfisService.localizarUsuario() fazem
//
//     SELECT ... WHERE clerk_id = $1 LIMIT 1
//
// sem ORDER BY. Com duas linhas candidatas, o Postgres devolve QUALQUER uma —
// e pode devolver uma hoje e outra amanhã, porque a ordem física da tabela
// muda a cada UPDATE. Isso explica gravar o perfil num registro e ler de
// outro.
//
// Este script NÃO altera nada. Só lê e imprime.
//
//   node scripts/check-usuarios-duplicados.js
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

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
  const pool = new Pool(conexao())
  const c    = await pool.connect()

  try {
    const { rows: schemas } = await c.query(`
      SELECT schema_name FROM information_schema.schemata
      WHERE schema_name LIKE 'tenant\\_%' ESCAPE '\\'
      ORDER BY schema_name
    `)

    for (const { schema_name: schema } of schemas) {
      console.log(`\n${'═'.repeat(70)}\n${schema}\n${'═'.repeat(70)}`)
      await c.query(`SET search_path TO "${schema}", public`)

      // ── 1. Retrato completo ────────────────────────────────────────────
      const todos = await c.query(`
        SELECT u.usuario_id, u.nome, u.email, u.clerk_id,
               u.perfil, u.perfil_id, p.nome AS perfil_nome, p.is_admin,
               u.active_flg,
               u.created_dt, u.updated_dt
        FROM t_usuario u
        LEFT JOIN t_perfil_acesso p ON p.perfil_id = u.perfil_id
        ORDER BY LOWER(u.email), u.usuario_id
      `)
      console.log('\n── TODOS OS USUÁRIOS ──')
      console.table(todos.rows.map(r => ({
        id: r.usuario_id,
        nome: r.nome,
        email: r.email,
        clerk_id: r.clerk_id,
        perfil_txt: r.perfil,
        perfil_id: r.perfil_id,
        perfil_nome: r.perfil_nome,
        admin: r.is_admin,
        ativo: r.active_flg,
      })))

      // ── 2. E-mail repetido ─────────────────────────────────────────────
      const dupEmail = await c.query(`
        SELECT LOWER(email) AS email, COUNT(*)::int AS linhas,
               ARRAY_AGG(usuario_id ORDER BY usuario_id) AS ids,
               ARRAY_AGG(clerk_id   ORDER BY usuario_id) AS clerk_ids,
               ARRAY_AGG(nome       ORDER BY usuario_id) AS nomes
        FROM t_usuario
        WHERE email IS NOT NULL AND TRIM(email) <> ''
        GROUP BY LOWER(email)
        HAVING COUNT(*) > 1
      `)
      if (dupEmail.rows.length) {
        console.log('\n── E-MAIL DUPLICADO (causa provável dos três sintomas) ──')
        for (const r of dupEmail.rows) {
          console.log(`  ${r.email} → ${r.linhas} linhas`)
          console.log(`     ids:       ${r.ids.join(', ')}`)
          console.log(`     nomes:     ${r.nomes.join(' | ')}`)
          console.log(`     clerk_ids: ${r.clerk_ids.join(' | ')}`)
        }
      } else {
        console.log('\n── E-MAIL DUPLICADO: nenhum ──')
      }

      // ── 3. clerk_id repetido ───────────────────────────────────────────
      const dupClerk = await c.query(`
        SELECT clerk_id, COUNT(*)::int AS linhas,
               ARRAY_AGG(usuario_id ORDER BY usuario_id) AS ids,
               ARRAY_AGG(nome       ORDER BY usuario_id) AS nomes
        FROM t_usuario
        WHERE clerk_id IS NOT NULL AND clerk_id NOT LIKE 'pending%'
        GROUP BY clerk_id
        HAVING COUNT(*) > 1
      `)
      if (dupClerk.rows.length) {
        console.log('\n── CLERK_ID DUPLICADO (o login vira loteria entre estas linhas) ──')
        for (const r of dupClerk.rows) {
          console.log(`  ${r.clerk_id} → ids ${r.ids.join(', ')} | ${r.nomes.join(' | ')}`)
        }
      } else {
        console.log('\n── CLERK_ID DUPLICADO: nenhum ──')
      }

      // ── 4. Vínculo pendente ────────────────────────────────────────────
      const pend = todos.rows.filter(r => String(r.clerk_id ?? '').startsWith('pending'))
      console.log(`\n── VÍNCULO PENDENTE: ${pend.length} ──`)
      for (const p of pend) console.log(`  id ${p.usuario_id} · ${p.nome} · ${p.email} · ${p.clerk_id}`)

      // ── 5. Perfil inconsistente ────────────────────────────────────────
      // perfil (texto: 'admin'/'user') e perfil_id (FK) são gravados em
      // lugares diferentes do código. Quando discordam, a tela mostra uma
      // coisa e a autorização usa outra.
      const conflito = todos.rows.filter(r => {
        const ehAdminTexto = String(r.perfil ?? '').toLowerCase() === 'admin'
        const ehAdminFk    = r.is_admin === true
        return r.perfil_id !== null && ehAdminTexto !== ehAdminFk
      })
      if (conflito.length) {
        console.log('\n── perfil (texto) DISCORDA de perfil_id (FK) ──')
        console.table(conflito.map(r => ({
          id: r.usuario_id, nome: r.nome,
          perfil_txt: r.perfil, perfil_id: r.perfil_id,
          perfil_nome: r.perfil_nome, is_admin: r.is_admin,
        })))
      } else {
        console.log('\n── perfil texto vs. FK: sem conflito ──')
      }

      // ── 6. Sem perfil nenhum ───────────────────────────────────────────
      const semPerfil = todos.rows.filter(r => r.perfil_id === null)
      if (semPerfil.length) {
        console.log('\n── SEM perfil_id (não enxergam nada no sistema) ──')
        for (const r of semPerfil) console.log(`  id ${r.usuario_id} · ${r.nome} · ${r.email}`)
      }

      // ── 7. Perfil órfão ────────────────────────────────────────────────
      const orfaos = todos.rows.filter(r => r.perfil_id !== null && r.perfil_nome === null)
      if (orfaos.length) {
        console.log('\n── perfil_id apontando para perfil INEXISTENTE ──')
        for (const r of orfaos) console.log(`  id ${r.usuario_id} · ${r.nome} · perfil_id ${r.perfil_id}`)
      }

      // ── 8. Perfis cadastrados ──────────────────────────────────────────
      const perfis = await c.query(`
        SELECT perfil_id, nome, is_admin, acesso_gerencial, acesso_pdv, active_flg
        FROM t_perfil_acesso ORDER BY perfil_id
      `).catch(e => { console.log('  t_perfil_acesso:', e.message); return { rows: [] } })
      console.log('\n── PERFIS CADASTRADOS ──')
      console.table(perfis.rows)
    }
  } finally {
    c.release()
    await pool.end()
  }
}

main().catch(err => { console.error(err); process.exit(1) })
