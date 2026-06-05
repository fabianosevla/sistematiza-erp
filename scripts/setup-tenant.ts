/**
 * Script de setup inicial — cria tabela de tenants no schema public
 * Executar uma vez após configurar o banco: npm run setup
 */
import { Pool } from 'pg'
import * as readline from 'readline'

const pool = new Pool({
  host:     process.env.DB_HOST     ?? 'localhost',
  port:     Number(process.env.DB_PORT ?? 5432),
  database: process.env.DB_NAME     ?? 'sistematiza_erp',
  user:     process.env.DB_USER     ?? 'postgres',
  password: process.env.DB_PASSWORD ?? '',
  ssl:      process.env.DB_HOST?.includes('amazonaws') ? { rejectUnauthorized: false } : false,
})

async function main() {
  console.log('\n=== sistematiza.erp — Setup do banco de dados ===\n')

  const client = await pool.connect()
  try {
    // Criar tabela t_tenant no schema public
    await client.query(\`
      CREATE TABLE IF NOT EXISTS public.t_tenant (
        tenant_id       SERIAL PRIMARY KEY,
        modification_num INTEGER NOT NULL DEFAULT 0,
        created_dt      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_dt      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        active_flg      BOOLEAN NOT NULL DEFAULT TRUE,
        slug            VARCHAR(100) NOT NULL UNIQUE,
        name            VARCHAR(200) NOT NULL,
        schema_name     VARCHAR(100) NOT NULL UNIQUE,
        owner_clerk_id  VARCHAR(200) NOT NULL,
        plan            VARCHAR(50)  NOT NULL DEFAULT 'starter'
      )
    \`)
    console.log('✓ Tabela public.t_tenant criada/verificada')
    console.log('\n✅ Setup concluído! Agora inicie o servidor:\n   npm run dev\n')
    console.log('   Acesse http://localhost:3000 e crie sua conta.')
    console.log('   Após o login, você será direcionado para criar sua empresa.\n')
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch(err => {
  console.error('Erro no setup:', err)
  process.exit(1)
})
