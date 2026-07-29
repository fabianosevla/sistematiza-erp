/**
 * scripts/migrate-compras-modulo.js
 *
 * O módulo Compras existe (telas + rotas), mas nunca foi registrado como
 * módulo do sistema. Esta migration cria as duas flags que faltavam:
 *
 *   t_configuracoes_tenant.compras_ativo  → liga/desliga o módulo no tenant
 *   t_perfil_acesso.modulo_compras        → permissão por perfil de acesso
 *
 * Idempotente. Rodar: node scripts/migrate-compras-modulo.js
 */
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

const pool = new Pool({
  host: process.env.DB_HOST, port: 5432,
  database: process.env.DB_NAME, user: process.env.DB_USER,
  password: process.env.DB_PASSWORD, ssl: { rejectUnauthorized: false },
})

pool.connect().then(async client => {
  const res = await client.query(`
    SELECT schema_name FROM information_schema.schemata
    WHERE schema_name LIKE 'tenant_%' ORDER BY schema_name
  `)
  const schemas = res.rows.map(r => r.schema_name)
  console.log(`\nRegistrando o módulo Compras em ${schemas.length} schema(s)...\n`)

  for (const schema of schemas) {
    try {
      await client.query(`SET search_path TO "${schema}", public`)

      await client.query(`
        ALTER TABLE t_configuracoes_tenant
        ADD COLUMN IF NOT EXISTS compras_ativo BOOLEAN NOT NULL DEFAULT true
      `)

      await client.query(`
        ALTER TABLE t_perfil_acesso
        ADD COLUMN IF NOT EXISTS modulo_compras BOOLEAN NOT NULL DEFAULT false
      `)

      // Perfis de acesso total já enxergam tudo — mantém coerente
      await client.query(`
        UPDATE t_perfil_acesso SET modulo_compras = true WHERE is_admin = true
      `)

      console.log(`  ✓ ${schema}`)
    } catch (e) {
      console.error(`  ✗ ${schema}: ${e.message}`)
    }
  }

  console.log('\n✅ Migration concluída!\n')
  client.release()
  pool.end()
}).catch(err => { console.error('Erro:', err.message); process.exit(1) })