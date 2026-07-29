// scripts/check-perfis.js
//
// Diagnóstico SOMENTE LEITURA dos perfis de acesso.
//
// Responde três perguntas:
//   1. A tabela t_perfil_acesso tem todas as colunas que o código grava?
//      (uma coluna faltando faz o INSERT devolver 500)
//   2. Quais perfis existem?
//   3. Quais usuários existem e a que perfil estão ligados?
//
//   node scripts/check-perfis.js
//   node scripts/check-perfis.js --tenant tenant_outro
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

const argv   = process.argv.slice(2)
const iTen   = argv.indexOf('--tenant')
const TENANT = iTen >= 0 ? argv[iTen + 1] : 'tenant_zaghi_massas_caseiras'

// Colunas que o código de perfis espera encontrar.
const ESPERADAS = [
  'perfil_id', 'nome', 'descricao', 'is_admin',
  'modulo_dashboard', 'modulo_cadastros', 'modulo_vendas', 'modulo_financeiro',
  'modulo_estoque', 'modulo_producao', 'modulo_pedidos', 'modulo_comandas',
  'modulo_fiscal', 'modulo_metas', 'modulo_consultas', 'modulo_plano_acao',
  'modulo_fidelidade', 'modulo_compras',
  'pode_criar', 'pode_editar', 'pode_excluir',
  'active_flg', 'modification_num', 'created_dt', 'created_by', 'updated_dt', 'updated_by',
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
    await client.query(`SET search_path TO "${TENANT}", public`)
    console.log(`\nschema: ${TENANT}\n`)

    // ── 1. Colunas ─────────────────────────────────────────────────────────
    const { rows: cols } = await client.query(
      `SELECT column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = 't_perfil_acesso'
       ORDER BY ordinal_position`,
      [TENANT]
    )

    if (cols.length === 0) {
      console.log('t_perfil_acesso NÃO EXISTE neste schema.')
      console.log('É essa a causa do 500. Rode a migration que cria a tabela.\n')
      return
    }

    const existentes = new Set(cols.map(c => c.column_name))
    const faltando   = ESPERADAS.filter(c => !existentes.has(c))
    const sobrando   = cols.map(c => c.column_name).filter(c => !ESPERADAS.includes(c))

    console.log(`── Colunas de t_perfil_acesso — ${cols.length} encontradas`)
    if (faltando.length > 0) {
      console.log('\n   FALTANDO (o INSERT quebra por causa destas):')
      for (const f of faltando) console.log(`     ${f}`)
      console.log('\n   Correção:')
      for (const f of faltando) {
        const tipo = f.startsWith('modulo_') || f.startsWith('pode_') || f === 'is_admin'
          ? 'BOOLEAN NOT NULL DEFAULT false'
          : 'TEXT'
        console.log(`     ALTER TABLE "${TENANT}".t_perfil_acesso ADD COLUMN IF NOT EXISTS ${f} ${tipo};`)
      }
    } else {
      console.log('   Todas as colunas esperadas existem.')
    }
    if (sobrando.length > 0) {
      console.log(`\n   Colunas extras (não usadas pelo código): ${sobrando.join(', ')}`)
    }

    // Colunas NOT NULL sem default são candidatas a quebrar o INSERT
    const obrigatoriasSemDefault = cols.filter(
      c => c.is_nullable === 'NO' && !c.column_default && c.column_name !== 'perfil_id'
    )
    if (obrigatoriasSemDefault.length > 0) {
      console.log('\n   NOT NULL sem default — se o código não enviar, o INSERT falha:')
      console.table(obrigatoriasSemDefault.map(c => ({ coluna: c.column_name, tipo: c.data_type })))
    }

    // ── 2. Perfis existentes ───────────────────────────────────────────────
    const { rows: perfis } = await client.query(
      `SELECT * FROM t_perfil_acesso ORDER BY perfil_id`
    )
    console.log(`\n── Perfis cadastrados — ${perfis.length}`)
    if (perfis.length === 0) {
      console.log('   Nenhum. Por isso o seletor de perfil aparece vazio.')
    } else {
      console.table(perfis.map(p => ({
        id:      p.perfil_id,
        nome:    p.nome,
        admin:   p.is_admin,
        criar:   p.pode_criar,
        editar:  p.pode_editar,
        excluir: p.pode_excluir,
        ativo:   p.active_flg,
      })))
    }

    // ── 3. Usuários e vínculo com perfil ───────────────────────────────────
    const { rows: colsUsuario } = await client.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = 't_usuario'`,
      [TENANT]
    )
    const nomesUsuario = colsUsuario.map(c => c.column_name)
    const temPerfilId  = nomesUsuario.includes('perfil_id')

    console.log(`\n── Usuários`)
    console.log(`   t_usuario tem coluna perfil_id? ${temPerfilId ? 'sim' : 'NÃO — o vínculo não existe'}`)

    const { rows: usuarios } = await client.query(`
      SELECT u.*
      FROM t_usuario u
      WHERE u.active_flg = true
      ORDER BY u.usuario_id
    `)
    console.table(usuarios.map(u => ({
      id:      u.usuario_id,
      nome:    u.nome,
      email:   u.email,
      cargo:   u.cargo ?? u.tipo ?? '',
      perfil:  temPerfilId ? (u.perfil_id ?? 'NENHUM') : 'n/a',
      clerk:   u.clerk_id ? 'vinculado' : 'sem clerk_id',
      ativo:   u.active_flg,
    })))

    console.log('')
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch(err => { console.error(err); process.exit(1) })