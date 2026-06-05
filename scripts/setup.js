/**
 * Setup inicial do banco — cria tabela de tenants no schema public
 * Executar: node scripts/setup.js
 */
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     Number(process.env.DB_PORT ?? 5432),
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl:      { rejectUnauthorized: false },
})

async function main() {
  console.log('\n=== sistematiza.erp — Setup do banco de dados ===\n')
  console.log('Conectando em:', process.env.DB_HOST)

  const client = await pool.connect()
  try {
    console.log('✓ Conectado ao banco com sucesso')

    await client.query(`
      CREATE TABLE IF NOT EXISTS public.t_tenant (
        tenant_id        SERIAL PRIMARY KEY,
        modification_num INTEGER     NOT NULL DEFAULT 0,
        created_dt       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_dt       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        active_flg       BOOLEAN     NOT NULL DEFAULT TRUE,
        slug             VARCHAR(100) NOT NULL UNIQUE,
        name             VARCHAR(200) NOT NULL,
        schema_name      VARCHAR(100) NOT NULL UNIQUE,
        owner_clerk_id   VARCHAR(200) NOT NULL,
        plan             VARCHAR(50)  NOT NULL DEFAULT 'starter'
      )
    `)
    console.log('✓ Tabela public.t_tenant criada/verificada')

    console.log('\n✅ Setup concluído!\n')
    console.log('Próximo passo: npm run dev')
    console.log('Acesse http://localhost:3000 e crie sua conta.\n')
  } catch (err) {
    console.error('\n❌ Erro:', err.message)
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
}

main()
