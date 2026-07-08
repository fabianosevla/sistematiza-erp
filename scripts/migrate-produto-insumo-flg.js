/**
 * Migration: produto que também é insumo
 * Adiciona a flag `insumo_flg` em t_produto.
 *
 * Convenção de identidade (sem alterar t_produto_insumo):
 *  - Produto com insumo_flg = true aparece na listagem de insumos com
 *    insumoId = -produto_id (negativo). A ficha técnica grava esse valor
 *    negativo em t_produto_insumo.insumo_id. A baixa de produção detecta
 *    insumo_id < 0 e debita t_produto em vez de t_insumo.
 *
 * Rodar: node scripts/migrate-produto-insumo-flg.js
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
  console.log(`\nMigrando produto-insumo no schema: ${SCHEMA}\n`)
  await client.query(`SET search_path TO "${SCHEMA}", public`)

  await client.query(`ALTER TABLE t_produto ADD COLUMN IF NOT EXISTS insumo_flg BOOLEAN NOT NULL DEFAULT FALSE`)
  console.log('✓ Coluna insumo_flg adicionada em t_produto')

  console.log('\n✅ Migration concluída!\n')
  client.release()
  pool.end()
}).catch(err => { console.error('Erro:', err.message); process.exit(1) })