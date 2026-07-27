/**
 * Migration: coluna `revenda` própria em t_produto
 *
 * Antes, "produto para revenda" era guardado sobrescrevendo tipo='Revenda',
 * o que impedia um produto de ser (por ex.) "Bebida" E "Revenda" ao mesmo
 * tempo. Agora revenda é um boolean independente do tipo.
 *
 * Também migra os produtos existentes: quem tem tipo='Revenda' ganha
 * revenda=true (o tipo antigo é mantido — ajuste manualmente no cadastro
 * se quiser trocar 'Revenda' por 'Bebida' etc.).
 *
 * Rodar: node scripts/migrate-produto-revenda.js
 */
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     5432,
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl:      { rejectUnauthorized: false },
})

const SCHEMA = 'tenant_zaghi_massas_caseiras'

pool.connect().then(async client => {
  console.log(`\nMigrando coluna revenda no schema: ${SCHEMA}\n`)
  await client.query(`SET search_path TO "${SCHEMA}", public`)

  await client.query(`ALTER TABLE t_produto ADD COLUMN IF NOT EXISTS revenda BOOLEAN NOT NULL DEFAULT FALSE`)
  console.log('✓ Coluna revenda adicionada em t_produto')

  const r = await client.query(`
    UPDATE t_produto SET revenda = true
    WHERE tipo = 'Revenda' AND revenda = false
    RETURNING produto_id, nome
  `)
  console.log(`✓ ${r.rowCount} produto(s) com tipo='Revenda' migrados para revenda=true:`)
  r.rows.forEach(row => console.log(`    ID ${row.produto_id}: ${row.nome}`))

  console.log('\n✅ Migration concluída!\n')
  client.release()
  pool.end()
}).catch(err => { console.error('Erro:', err.message); process.exit(1) })