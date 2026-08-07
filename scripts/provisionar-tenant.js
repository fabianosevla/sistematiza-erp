// scripts/provisionar-tenant.js
//
// CRIA UMA EMPRESA NOVA A PARTIR DO tenant_modelo.
//
// Passo 4 do plano em docs/provisionamento.md. É o script que substitui a tela
// de onboarding, que criava 4 das 63 tabelas.
//
//   node scripts/provisionar-tenant.js --slug padaria-bela --nome "Padaria Bela" --email dono@padaria.com
//   node scripts/provisionar-tenant.js ... --aplicar
//
// Opcional: --plano starter|pro   (default starter — só registra, não trava nada)
//
// ─── O QUE ACONTECE, EM UMA TRANSAÇÃO ───────────────────────────────────────
//
//   1. CREATE SCHEMA tenant_<slug>
//   2. 63 tabelas clonadas do modelo (LIKE INCLUDING ALL)
//   3. foreign keys recriadas apontando para dentro do schema novo
//   4. semente copiada do modelo (perfis, domínios, formas de pagamento)
//   5. linha de t_configuracoes_tenant criada com o nome da empresa
//   6. dono inserido em t_usuario como pending_<email>, perfil admin
//   7. empresa registrada em public.t_tenant
//
// Qualquer falha desfaz tudo. Não existe empresa pela metade.
//
// ─── POR QUE O PASSO 5 NÃO É OPCIONAL ───────────────────────────────────────
//
// A rota de configurações faz `UPDATE t_configuracoes_tenant SET col = $1` sem
// WHERE e sem INSERT de fallback. Sem a linha, o cliente preenche o cadastro da
// empresa, vê "salvo com sucesso" e o campo volta vazio — sem erro em lugar
// nenhum. Já aconteceu neste sistema.
//
// ─── POR QUE O PASSO 6 BASTA PARA O DONO ENTRAR ─────────────────────────────
//
// O resolveTenant autoriza pelo t_usuario quando o publicMetadata do Clerk vem
// vazio, e grava o vínculo na primeira requisição. Então basta convidar o
// e-mail pelo painel do Clerk: ele aceita, entra, e o sistema liga a conta ao
// schema sozinho.
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

const MODELO = 'tenant_modelo'

function arg(nome) {
  const i = process.argv.indexOf(`--${nome}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

const APLICAR = process.argv.includes('--aplicar')
const SLUG    = (arg('slug')  ?? '').trim().toLowerCase()
const NOME    = (arg('nome')  ?? '').trim()
const EMAIL   = (arg('email') ?? '').trim().toLowerCase()
const PLANO   = (arg('plano') ?? 'starter').trim()
const DONO    = (arg('dono')  ?? '').trim() || NOME

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

async function pkDe(c, schema, tabela) {
  const r = await c.query(`
    SELECT a.attname
      FROM pg_index i
      JOIN pg_class cl     ON cl.oid = i.indrelid
      JOIN pg_namespace ns ON ns.oid = cl.relnamespace
      JOIN pg_attribute a  ON a.attrelid = cl.oid AND a.attnum = ANY(i.indkey)
     WHERE ns.nspname = $1 AND cl.relname = $2 AND i.indisprimary
     LIMIT 1
  `, [schema, tabela])
  return r.rows[0]?.attname ?? null
}

async function main() {
  // ── Validação de entrada ──────────────────────────────────────────────────
  if (!SLUG || !NOME || !EMAIL) {
    console.log('\nUso:')
    console.log('  node scripts/provisionar-tenant.js --slug padaria-bela --nome "Padaria Bela" --email dono@padaria.com')
    console.log('\nOpcionais: --dono "Nome do Dono"  --plano starter  --aplicar')
    process.exit(1)
  }
  // Mesma regra do onboarding: o slug vira nome de schema, e schema não aceita
  // hífen sem aspas nem caractere especial.
  if (!/^[a-z0-9-]+$/.test(SLUG)) {
    throw new Error('Slug invalido. Use apenas letras minusculas, numeros e hifen.')
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(EMAIL)) {
    throw new Error('E-mail invalido.')
  }

  const SCHEMA = `tenant_${SLUG.replace(/-/g, '_')}`

  const pool = new Pool(conexao())
  const c    = await pool.connect()

  try {
    console.log(APLICAR ? '\n>>> MODO GRAVACAO\n' : '\n>>> SIMULACAO — nada sera gravado. Use --aplicar.\n')
    console.log(`empresa: ${NOME}`)
    console.log(`slug:    ${SLUG}`)
    console.log(`schema:  ${SCHEMA}`)
    console.log(`dono:    ${DONO} <${EMAIL}>`)
    console.log(`plano:   ${PLANO}\n`)

    // ── Pré-condições ───────────────────────────────────────────────────────
    const temModelo = await c.query(
      `SELECT 1 FROM information_schema.schemata WHERE schema_name = $1`, [MODELO])
    if (temModelo.rows.length === 0) {
      throw new Error(`"${MODELO}" nao existe. Rode antes: node scripts/criar-schema-modelo.js --aplicar`)
    }

    const slugUsado = await c.query(`SELECT 1 FROM public.t_tenant WHERE slug = $1`, [SLUG])
    if (slugUsado.rows.length > 0) throw new Error(`Slug "${SLUG}" ja esta em uso.`)

    const schemaUsado = await c.query(
      `SELECT 1 FROM information_schema.schemata WHERE schema_name = $1`, [SCHEMA])
    if (schemaUsado.rows.length > 0) throw new Error(`Schema "${SCHEMA}" ja existe.`)

    // ── O que será feito ────────────────────────────────────────────────────
    const tabelas = (await c.query(`
      SELECT table_name FROM information_schema.tables
       WHERE table_schema = $1 AND table_type = 'BASE TABLE' ORDER BY table_name
    `, [MODELO])).rows.map(r => r.table_name)

    const fks = (await c.query(`
      SELECT cl.relname AS tabela, con.conname AS nome, pg_get_constraintdef(con.oid) AS definicao
        FROM pg_constraint con
        JOIN pg_class cl     ON cl.oid = con.conrelid
        JOIN pg_namespace ns ON ns.oid = cl.relnamespace
       WHERE ns.nspname = $1 AND con.contype = 'f'
    `, [MODELO])).rows

    // Tabelas do modelo que têm semente. As outras nascem vazias.
    const comDados = []
    for (const t of tabelas) {
      const n = await c.query(`SELECT COUNT(*)::int AS n FROM "${MODELO}"."${t}"`)
      if (n.rows[0].n > 0) comDados.push({ tabela: t, linhas: n.rows[0].n })
    }

    console.log(`${tabelas.length} tabela(s) · ${fks.length} foreign key(s)`)
    console.log(`semente: ${comDados.map(d => `${d.tabela} (${d.linhas})`).join(', ') || 'nenhuma'}\n`)

    if (!APLICAR) {
      console.log('Rode com --aplicar para criar a empresa.')
      return
    }

    await c.query('BEGIN')
    try {
      // 1. Schema
      await c.query(`CREATE SCHEMA "${SCHEMA}"`)

      // 2. Estrutura. O modelo já está com IDENTITY, então o LIKE cria sequence
      //    própria para cada tabela — sem herdar numeração de ninguém.
      for (const t of tabelas) {
        await c.query(`CREATE TABLE "${SCHEMA}"."${t}" (LIKE "${MODELO}"."${t}" INCLUDING ALL)`)
      }
      console.log(`  ${tabelas.length} tabela(s)`)

      // 3. Foreign keys, reapontadas para dentro do schema novo
      for (const fk of fks) {
        const def = fk.definicao.replaceAll(`${MODELO}.`, `"${SCHEMA}".`)
        await c.query(`ALTER TABLE "${SCHEMA}"."${fk.tabela}" ADD CONSTRAINT "${fk.nome}" ${def}`)
      }
      console.log(`  ${fks.length} foreign key(s)`)

      // 4. Semente, com os contadores reposicionados depois
      for (const { tabela } of comDados) {
        await c.query(`INSERT INTO "${SCHEMA}"."${tabela}" SELECT * FROM "${MODELO}"."${tabela}"`)
        const pk = await pkDe(c, SCHEMA, tabela)
        if (pk) {
          const max = await c.query(`SELECT COALESCE(MAX("${pk}"), 0)::int AS m FROM "${SCHEMA}"."${tabela}"`)
          await c.query(
            `ALTER TABLE "${SCHEMA}"."${tabela}" ALTER COLUMN "${pk}" RESTART WITH ${max.rows[0].m + 1}`)
        }
      }
      console.log(`  semente copiada`)

      // 5. Linha de configurações.
      //
      // Montada por inspeção em vez de INSERT fixo: a tabela tem dezenas de
      // colunas e ganhou outras por migração ao longo do tempo. Preenche o nome
      // da empresa e o que for NOT NULL sem default; o resto fica no padrão.
      const colsCfg = (await c.query(`
        SELECT column_name, data_type, is_nullable, column_default
          FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = 't_configuracoes_tenant'
      `, [SCHEMA])).rows

      const nomes = []
      const vals  = []
      const push  = (col, val) => { nomes.push(`"${col}"`); vals.push(val) }

      for (const col of colsCfg) {
        const n = col.column_name
        if (n === 'config_id') continue                       // IDENTITY
        if (n === 'nome_empresa' || n === 'nome_fantasia') { push(n, NOME); continue }
        if (n === 'created_dt' || n === 'updated_dt') { push(n, new Date()); continue }
        if (n === 'created_by' || n === 'updated_by') { push(n, 1); continue }
        // Demais colunas: só entram se forem obrigatórias e não tiverem default.
        if (col.is_nullable === 'NO' && !col.column_default) {
          const t = col.data_type
          push(n, t === 'boolean' ? false
                : /int|numeric|double|real/.test(t) ? 0
                : t.includes('timestamp') || t === 'date' ? new Date()
                : '')
        }
      }
      const ph = vals.map((_, i) => `$${i + 1}`).join(', ')
      await c.query(
        `INSERT INTO "${SCHEMA}".t_configuracoes_tenant (${nomes.join(', ')}) VALUES (${ph})`, vals)
      console.log('  configuracoes da empresa')

      // 6. Dono. clerk_id provisório no mesmo formato que o convite usa —
      //    o resolveTenant troca pelo id real no primeiro acesso.
      const perfilAdmin = await c.query(
        `SELECT perfil_id FROM "${SCHEMA}".t_perfil_acesso WHERE is_admin = true LIMIT 1`)
      const perfilId = perfilAdmin.rows[0]?.perfil_id ?? null

      await c.query(`
        INSERT INTO "${SCHEMA}".t_usuario
          (clerk_id, nome, email, perfil, perfil_id, created_by, updated_by, created_dt, updated_dt, active_flg, modification_num)
        VALUES ($1, $2, $3, 'admin', $4, 1, 1, NOW(), NOW(), true, 0)
      `, [`pending_${EMAIL.replace(/[^a-z0-9]/gi, '_')}`, DONO, EMAIL, perfilId])
      console.log('  usuario dono')

      // 7. Registro no schema público
      await c.query(`
        INSERT INTO public.t_tenant
          (slug, name, schema_name, owner_clerk_id, plan, created_dt, updated_dt, active_flg, modification_num)
        VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), true, 0)
      `, [SLUG, NOME, SCHEMA, `pending_${EMAIL.replace(/[^a-z0-9]/gi, '_')}`, PLANO])
      console.log('  registro em t_tenant')

      await c.query('COMMIT')
    } catch (e) {
      await c.query('ROLLBACK')
      throw e
    }

    console.log(`\nOK — ${NOME} provisionada.\n`)
    console.log('Proximo passo, manual:')
    console.log(`  1. Clerk (Production) -> Users -> Invite -> ${EMAIL}`)
    console.log(`  2. O dono aceita o convite e entra em https://app.sistematizaoficial.com/${SLUG}`)
    console.log('  3. O vinculo com o schema se faz sozinho no primeiro acesso')
  } finally {
    c.release()
    await pool.end()
  }
}

main().catch(err => { console.error('\nERRO:', err.message); process.exit(1) })
