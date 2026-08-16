// scripts/migrate-cardapio-layout.js
//
// Cardápio Digital vira menu próprio (antes era só uma seção dentro de
// Configurações). Colunas novas para layout e comportamento do pedido:
//
//   t_configuracoes_tenant.cardapio_mensagem_boas_vindas  (texto no topo do cardápio)
//   t_configuracoes_tenant.cardapio_cor_destaque           (cor dos botões/destaques)
//   t_configuracoes_tenant.cardapio_whatsapp               (número que recebe o pedido)
//   t_configuracoes_tenant.cardapio_permite_entrega        (default true)
//   t_configuracoes_tenant.cardapio_permite_balcao         (default true)
//
// Idempotente. Rodar: node scripts/migrate-cardapio-layout.js
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
  console.log(`\nAdicionando colunas de layout do cardápio em ${schemas.length} schema(s)...\n`)

  for (const schema of schemas) {
    try {
      await client.query(`SET search_path TO "${schema}", public`)

      await client.query(`
        ALTER TABLE t_configuracoes_tenant
        ADD COLUMN IF NOT EXISTS cardapio_mensagem_boas_vindas VARCHAR(300),
        ADD COLUMN IF NOT EXISTS cardapio_cor_destaque VARCHAR(9),
        ADD COLUMN IF NOT EXISTS cardapio_whatsapp VARCHAR(20),
        ADD COLUMN IF NOT EXISTS cardapio_permite_entrega BOOLEAN NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS cardapio_permite_balcao BOOLEAN NOT NULL DEFAULT true
      `)

      console.log(`  ${schema}: ok`)
    } catch (err) {
      console.error(`  ${schema}: ERRO — ${err.message}`)
    }
  }

  console.log('\nConcluído. Lembre de rodar:')
  console.log('   node scripts/criar-schema-modelo.js --aplicar\n')
  client.release()
  pool.end()
}).catch(err => {
  console.error('Falha ao conectar:', err.message)
  process.exit(1)
})
