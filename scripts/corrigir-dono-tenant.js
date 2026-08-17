// scripts/corrigir-dono-tenant.js
//
// TROCA O E-MAIL DO DONO DE UM TENANT JA PROVISIONADO.
//
// Serve para quando o provisionamento rodou com o e-mail errado. Corrige no
// lugar, sem apagar nem recriar o schema — os dados ficam onde estao.
//
//   node scripts/corrigir-dono-tenant.js --slug demo --email dono@dominio.com
//   node scripts/corrigir-dono-tenant.js --slug demo --email dono@dominio.com --aplicar
//
// Opcional: --nome "Nome do Dono"    troca tambem o nome
//           --forcar                 permite trocar mesmo se o dono ja logou
//
// ─── O QUE MUDA ─────────────────────────────────────────────────────────────
//
//   tenant_<slug>.t_usuario   -> email e clerk_id do dono
//   public.t_tenant           -> owner_clerk_id
//
// O clerk_id provisorio segue o mesmo formato do provisionar-tenant.js:
// "pending_" + e-mail com todo caractere nao alfanumerico virando "_".
// O resolveTenant troca esse valor pelo id real do Clerk no primeiro acesso.
//
// ─── QUANDO O SCRIPT RECUSA ─────────────────────────────────────────────────
//
// Se o dono ja aceitou o convite e entrou uma vez, o clerk_id deixa de comecar
// com "pending_" e passa a ser o id real do Clerk. Sobrescrever isso desliga a
// conta que ja funciona. Nesse caso o script para e explica — use --forcar
// apenas se souber que quer mesmo desvincular.
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

function arg(nome) {
  const i = process.argv.indexOf(`--${nome}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

const APLICAR = process.argv.includes('--aplicar')
const FORCAR  = process.argv.includes('--forcar')
const SLUG    = (arg('slug')  ?? '').trim().toLowerCase()
const EMAIL   = (arg('email') ?? '').trim().toLowerCase()
const NOME    = (arg('nome')  ?? '').trim()

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

const pendingDe = (email) => `pending_${email.replace(/[^a-z0-9]/gi, '_')}`

async function main() {
  if (!SLUG || !EMAIL) {
    console.log('\nUso:')
    console.log('  node scripts/corrigir-dono-tenant.js --slug demo --email dono@dominio.com')
    console.log('  node scripts/corrigir-dono-tenant.js --slug demo --email dono@dominio.com --aplicar')
    console.log('\nOpcionais: --nome "Nome do Dono"   --forcar\n')
    process.exit(1)
  }
  if (!/^[a-z0-9-]+$/.test(SLUG)) throw new Error('Slug invalido.')
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(EMAIL)) throw new Error('E-mail invalido.')

  const SCHEMA = `tenant_${SLUG.replace(/-/g, '_')}`
  if (/zaghi/i.test(SCHEMA) || /zaghi/i.test(SLUG)) {
    throw new Error('Recusado: este script nao mexe em schema de cliente real.')
  }

  const pool = new Pool(conexao())
  const c = await pool.connect()

  try {
    console.log(APLICAR ? '\n>>> MODO GRAVACAO\n' : '\n>>> SIMULACAO — nada sera gravado. Use --aplicar.\n')

    const existe = await c.query(
      `SELECT 1 FROM information_schema.schemata WHERE schema_name = $1`, [SCHEMA])
    if (existe.rows.length === 0) throw new Error(`Schema "${SCHEMA}" nao existe.`)

    const donos = (await c.query(`
      SELECT usuario_id, nome, email, clerk_id, perfil
        FROM "${SCHEMA}".t_usuario
       ORDER BY usuario_id
    `)).rows
    if (donos.length === 0) throw new Error(`Tenant "${SLUG}" nao tem usuario.`)

    const dono = donos[0]
    const jaLogou = !String(dono.clerk_id).startsWith('pending_')

    const tenant = (await c.query(
      `SELECT slug, name, schema_name, owner_clerk_id FROM public.t_tenant WHERE slug = $1`, [SLUG])).rows[0]

    console.log(`tenant:  ${tenant?.name ?? '(sem registro em t_tenant)'}  [${SLUG}]`)
    console.log(`schema:  ${SCHEMA}`)
    console.log(`usuarios no tenant: ${donos.length}\n`)

    console.log('DONO ATUAL')
    console.log(`  nome:     ${dono.nome}`)
    console.log(`  email:    ${dono.email}`)
    console.log(`  clerk_id: ${dono.clerk_id}${jaLogou ? '   <- id real, esta conta ja entrou' : '   (provisorio)'}`)
    if (tenant) console.log(`  t_tenant.owner_clerk_id: ${tenant.owner_clerk_id}`)

    console.log('\nDONO NOVO')
    console.log(`  nome:     ${NOME || dono.nome}${NOME ? '' : '   (inalterado)'}`)
    console.log(`  email:    ${EMAIL}`)
    console.log(`  clerk_id: ${pendingDe(EMAIL)}`)

    if (dono.email === EMAIL && !NOME) {
      console.log('\nNada a fazer: o e-mail ja e esse.\n')
      return
    }

    if (jaLogou && !FORCAR) {
      console.log('\nRECUSADO — o dono atual ja aceitou o convite e entrou no sistema.')
      console.log('Trocar o clerk_id agora desvincula a conta que hoje funciona.')
      console.log('Se e isso mesmo que voce quer, repita com --forcar.\n')
      process.exit(1)
    }

    // Um e-mail nao pode existir duas vezes no mesmo tenant.
    const conflito = (await c.query(
      `SELECT usuario_id, nome FROM "${SCHEMA}".t_usuario WHERE lower(email) = $1 AND usuario_id <> $2`,
      [EMAIL, dono.usuario_id])).rows
    if (conflito.length > 0) {
      throw new Error(`Ja existe outro usuario com esse e-mail neste tenant (id ${conflito[0].usuario_id}, ${conflito[0].nome}).`)
    }

    if (!APLICAR) {
      console.log('\nRode com --aplicar para gravar.\n')
      return
    }

    await c.query('BEGIN')
    try {
      const novoClerk = pendingDe(EMAIL)

      await c.query(`
        UPDATE "${SCHEMA}".t_usuario
           SET email = $1,
               clerk_id = $2,
               nome = COALESCE(NULLIF($3, ''), nome),
               updated_dt = NOW(),
               modification_num = modification_num + 1
         WHERE usuario_id = $4
      `, [EMAIL, novoClerk, NOME, dono.usuario_id])
      console.log('  t_usuario atualizado')

      const r = await c.query(`
        UPDATE public.t_tenant
           SET owner_clerk_id = $1, updated_dt = NOW(), modification_num = modification_num + 1
         WHERE slug = $2
      `, [novoClerk, SLUG])
      console.log(`  public.t_tenant atualizado (${r.rowCount ?? 1} linha)`)

      await c.query('COMMIT')
    } catch (e) {
      await c.query('ROLLBACK')
      throw e
    }

    console.log(`\nOK — dono de "${SLUG}" agora e ${EMAIL}.\n`)
    console.log('PROXIMO PASSO:')
    console.log(`  1. Clerk (Production) -> Users -> Invite -> ${EMAIL}`)
    console.log('  2. Aceite o convite e defina a senha')
    console.log(`  3. Entre em http://localhost:3000/${SLUG}`)
    console.log('  4. O vinculo com o schema se faz sozinho no primeiro acesso\n')
    console.log('Se voce ja tinha convidado o e-mail errado no Clerk, revogue aquele convite.\n')
  } finally {
    c.release()
    await pool.end()
  }
}

main().catch(err => { console.error('\nERRO:', err.message); process.exit(1) })
