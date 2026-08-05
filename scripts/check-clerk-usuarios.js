// scripts/check-clerk-usuarios.js
//
// O BANCO ESTÁ CERTO. A DÚVIDA AGORA É O CLERK.
//
// check-usuarios-duplicados.js mostrou que Maria Julia está gravada como
// Administrador, com perfil_id = 1 e is_admin = true. Ainda assim ela não
// acessa nada — e o clerk_id dela continua "pending_".
//
// O clerk_id só deixa de ser "pending_" quando a pessoa FAZ LOGIN: é no login
// que PerfisService.localizarUsuario() casa pelo e-mail e grava o ID real.
// Se o convite nunca chegou na caixa dela, ela nunca aceitou, nunca logou, e
// o vínculo nunca acontece. O sintoma ("marquei admin e ela continua sem
// acesso") é consequência, não causa.
//
// Este script pergunta ao Clerk três coisas:
//   1. quais contas existem de verdade
//   2. quais convites foram criados, e em que estado estão
//   3. quais e-mails do nosso banco não têm conta nem convite
//
// Só lê. Nenhuma chamada de escrita.
//
//   node scripts/check-clerk-usuarios.js
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

const CHAVE = process.env.CLERK_SECRET_KEY
const BASE  = 'https://api.clerk.com/v1'

async function clerk(caminho) {
  const r = await fetch(`${BASE}${caminho}`, {
    headers: { Authorization: `Bearer ${CHAVE}`, 'Content-Type': 'application/json' },
  })
  const texto = await r.text()
  if (!r.ok) throw new Error(`${caminho} → HTTP ${r.status}: ${texto.slice(0, 300)}`)
  return JSON.parse(texto)
}

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

const emailDoUsuario = u =>
  (u.email_addresses ?? []).find(e => e.id === u.primary_email_address_id)?.email_address
  ?? (u.email_addresses ?? [])[0]?.email_address
  ?? '(sem e-mail)'

async function main() {
  if (!CHAVE) {
    console.error('CLERK_SECRET_KEY não está no .env.local — sem ela não dá para consultar o Clerk.')
    process.exit(1)
  }
  console.log(`Ambiente Clerk: ${CHAVE.startsWith('sk_live') ? 'PRODUÇÃO (sk_live)' : 'TESTE (sk_test)'}`)
  if (!CHAVE.startsWith('sk_live')) {
    console.log('  ATENÇÃO: chave de teste não envia e-mail para endereço real.')
  }

  // ── 1. Contas existentes ─────────────────────────────────────────────
  const users = await clerk('/users?limit=100')
  console.log(`\n── CONTAS NO CLERK: ${users.length} ──`)
  console.table(users.map(u => ({
    clerk_id: u.id,
    email:    emailDoUsuario(u),
    nome:     [u.first_name, u.last_name].filter(Boolean).join(' ') || '—',
    ultimo_login: u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString('pt-BR') : 'NUNCA LOGOU',
    banido:   u.banned,
  })))

  // ── 2. Convites ──────────────────────────────────────────────────────
  const convites = await clerk('/invitations?limit=100')
  console.log(`\n── CONVITES: ${convites.length} ──`)
  console.table(convites.map(i => ({
    email:  i.email_address,
    status: i.status,               // pending | accepted | revoked | expired
    criado: new Date(i.created_at).toLocaleString('pt-BR'),
  })))

  // ── 3. Cruzamento com o nosso banco ──────────────────────────────────
  const pool = new Pool(conexao())
  const c    = await pool.connect()
  try {
    const { rows: schemas } = await c.query(`
      SELECT schema_name FROM information_schema.schemata
      WHERE schema_name LIKE 'tenant\\_%' ESCAPE '\\' ORDER BY schema_name
    `)
    for (const { schema_name: schema } of schemas) {
      await c.query(`SET search_path TO "${schema}", public`)
      const { rows } = await c.query(
        `SELECT usuario_id, nome, email, clerk_id FROM t_usuario WHERE active_flg = true ORDER BY usuario_id`
      )

      console.log(`\n── CRUZAMENTO — ${schema} ──`)
      console.table(rows.map(r => {
        const emailDb = String(r.email ?? '').trim().toLowerCase()
        const conta   = users.find(u => emailDoUsuario(u).toLowerCase() === emailDb)
        const convite = convites.find(i => String(i.email_address).toLowerCase() === emailDb)
        const pend    = String(r.clerk_id ?? '').startsWith('pending')

        let diagnostico
        if (conta && pend)                     diagnostico = 'CONTA EXISTE mas nosso clerk_id ficou pending — some no proximo login dela'
        else if (conta)                        diagnostico = 'ok'
        else if (convite?.status === 'pending') diagnostico = 'CONVITE ENVIADO, NAO ACEITO — ela precisa abrir o e-mail'
        else if (convite)                      diagnostico = `convite ${convite.status}`
        else                                   diagnostico = 'SEM CONTA E SEM CONVITE — o convite nunca foi criado'

        return {
          id: r.usuario_id,
          nome: r.nome,
          email: r.email,
          clerk_id_no_banco: pend ? 'pending_' : 'vinculado',
          conta_clerk: conta ? conta.id : '—',
          ja_logou: conta ? (conta.last_sign_in_at ? 'sim' : 'nunca') : '—',
          convite: convite ? convite.status : '—',
          diagnostico,
        }
      }))
    }
  } finally {
    c.release()
    await pool.end()
  }
}

main().catch(err => { console.error('\nERRO:', err.message); process.exit(1) })
