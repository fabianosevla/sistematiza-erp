/**
 * Migration: renomeia os perfis padrão pra nomes de função, não de módulo.
 * Gerencial → Administrador (mantém todos os acessos)
 * PDV       → Vendedor      (mantém acesso só ao PDV)
 * Comanda e Delivery seguem disponíveis, sem renomear — uso opcional para
 * clientes tipo restaurante.
 *
 * Rodar: node scripts/migrate-renomear-perfis.js
 */
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

const pool = new Pool({
  host: process.env.DB_HOST, port: 5432,
  database: process.env.DB_NAME, user: process.env.DB_USER,
  password: process.env.DB_PASSWORD, ssl: { rejectUnauthorized: false },
})

const SCHEMA = 'tenant_zaghi_massas_caseiras'

pool.connect().then(async client => {
  console.log(`\nRenomeando perfis — schema: ${SCHEMA}\n`)
  await client.query(`SET search_path TO "${SCHEMA}", public`)

  const r1 = await client.query(`UPDATE t_perfil_acesso SET nome = 'Administrador' WHERE nome = 'Gerencial' RETURNING perfil_id`)
  console.log(`✓ Gerencial → Administrador (${r1.rowCount} linha)`)

  const r2 = await client.query(`UPDATE t_perfil_acesso SET nome = 'Vendedor' WHERE nome = 'PDV' RETURNING perfil_id`)
  console.log(`✓ PDV → Vendedor (${r2.rowCount} linha)`)

  // Garante que t_usuario tem a coluna perfil_id (caso a migration de perfis
  // original não tenha rodado com esse nome exato)
  await client.query(`ALTER TABLE t_usuario ADD COLUMN IF NOT EXISTS perfil_id INTEGER`)
  console.log('✓ Coluna perfil_id confirmada em t_usuario')

  console.log('\n✅ Migration concluída!\n')
  client.release()
  pool.end()
}).catch(err => { console.error('Erro:', err.message); process.exit(1) })