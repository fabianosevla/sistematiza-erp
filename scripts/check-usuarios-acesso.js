// scripts/check-usuarios-acesso.js
//
// Por que um usuário convidado loga e não vê nada.
//
// PerfisService.getAcessosUsuario(clerkId) procura o usuário pelo clerk_id.
// No convite, o registro nasce com clerk_id = "pending_<email>". Quando a
// pessoa aceita, o Clerk passa a usar um ID real (user_xxx), mas o banco
// continua com o "pending_". A busca não acha ninguém e devolve tudo negado
// — inclusive para quem está marcado como admin.
//
// Este script mostra o clerk_id de cada usuário e o perfil vinculado.
// Só lê. Não altera nada.
//
//   node scripts/check-usuarios-acesso.js
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
      console.log(`\n══════ ${schema}`)
      await c.query(`SET search_path TO "${schema}", public`)

      const usuarios = await c.query(`
        SELECT u.usuario_id, u.nome, u.email, u.clerk_id, u.perfil, u.perfil_id,
               u.active_flg,
               (u.clerk_id LIKE 'pending%') AS vinculo_pendente
        FROM t_usuario u
        ORDER BY u.usuario_id
      `)
      console.log('\nUsuários:')
      console.table(usuarios.rows)

      const pendentes = usuarios.rows.filter(r => r.vinculo_pendente)
      if (pendentes.length > 0) {
        console.log('\nATENÇÃO — estes têm clerk_id "pending_" e NÃO conseguem acessar nada:')
        for (const p of pendentes) console.log(`  ${p.nome} (${p.email})`)
        console.log('  Mesmo marcados como admin, o sistema não localiza o registro deles.')
      }

      const perfis = await c.query(`
        SELECT perfil_id, nome, is_admin,
               acesso_gerencial, acesso_pdv, acesso_comanda, acesso_delivery,
               active_flg
        FROM t_perfil_acesso ORDER BY perfil_id
      `).catch(e => { console.log('  t_perfil_acesso:', e.message); return { rows: [] } })
      console.log('\nPerfis de acesso:')
      console.table(perfis.rows)

      // Usuário com perfil_id apontando para perfil inexistente também
      // resulta em acesso zero.
      const orfaos = await c.query(`
        SELECT u.usuario_id, u.nome, u.perfil_id
        FROM t_usuario u
        LEFT JOIN t_perfil_acesso p ON p.perfil_id = u.perfil_id
        WHERE u.perfil_id IS NOT NULL AND p.perfil_id IS NULL
      `).catch(() => ({ rows: [] }))
      if (orfaos.rows.length > 0) {
        console.log('\nUsuários apontando para perfil que não existe:')
        console.table(orfaos.rows)
      }
    }
  } finally {
    c.release()
    await pool.end()
  }
}

main().catch(err => { console.error(err); process.exit(1) })