require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

const pool = new Pool({
  host: process.env.DB_HOST, port: 5432,
  database: process.env.DB_NAME, user: process.env.DB_USER,
  password: process.env.DB_PASSWORD, ssl: { rejectUnauthorized: false },
})

const SCHEMA = 'tenant_zaghi_massas_caseiras'

pool.connect().then(async client => {
  console.log(`\nMigrando configurações v2 no schema: ${SCHEMA}\n`)
  await client.query(`SET search_path TO "${SCHEMA}", public`)

  await client.query(`ALTER TABLE t_configuracoes_tenant ADD COLUMN IF NOT EXISTS producao_ativo BOOLEAN NOT NULL DEFAULT TRUE`)
  await client.query(`ALTER TABLE t_configuracoes_tenant ADD COLUMN IF NOT EXISTS vendas_ativo   BOOLEAN NOT NULL DEFAULT TRUE`)
  await client.query(`ALTER TABLE t_configuracoes_tenant ADD COLUMN IF NOT EXISTS estoque_ativo  BOOLEAN NOT NULL DEFAULT TRUE`)
  await client.query(`ALTER TABLE t_configuracoes_tenant ADD COLUMN IF NOT EXISTS fiscal_ativo   BOOLEAN NOT NULL DEFAULT FALSE`)
  console.log('✓ Colunas de módulos adicionadas')

  await client.query(`
    CREATE TABLE IF NOT EXISTS t_gasto_fixo_categoria (
      categoria_id     SERIAL PRIMARY KEY,
      modification_num INTEGER NOT NULL DEFAULT 0,
      created_dt       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by       INTEGER NOT NULL DEFAULT 1,
      updated_dt       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by       INTEGER NOT NULL DEFAULT 1,
      active_flg       BOOLEAN NOT NULL DEFAULT TRUE,
      nome             VARCHAR(200) NOT NULL,
      ordem            INTEGER NOT NULL DEFAULT 0
    )
  `)
  console.log('✓ t_gasto_fixo_categoria criada')

  await client.query(`
    CREATE TABLE IF NOT EXISTS t_gasto_fixo_valor (
      valor_id         SERIAL PRIMARY KEY,
      modification_num INTEGER NOT NULL DEFAULT 0,
      created_dt       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by       INTEGER NOT NULL DEFAULT 1,
      updated_dt       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by       INTEGER NOT NULL DEFAULT 1,
      active_flg       BOOLEAN NOT NULL DEFAULT TRUE,
      categoria_id     INTEGER NOT NULL,
      ano              INTEGER NOT NULL,
      mes              INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
      valor            INTEGER NOT NULL DEFAULT 0
    )
  `)
  console.log('✓ t_gasto_fixo_valor criada')

  await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_gasto_fixo_unico ON t_gasto_fixo_valor (categoria_id, ano, mes)`)

  const categorias = [
    'Aluguel','Energia Elétrica','Água','Folha de Pagamento',
    'Internet','Telefone','Contador','Seguro','Manutenção','Outros'
  ]
  for (let i = 0; i < categorias.length; i++) {
    await client.query(
      `INSERT INTO t_gasto_fixo_categoria (nome, ordem)
       SELECT $1::text, $2::integer
       WHERE NOT EXISTS (SELECT 1 FROM t_gasto_fixo_categoria WHERE nome = $1::text)`,
      [categorias[i], i + 1]
    )
  }
  console.log('✓ Categorias padrão inseridas')

  console.log('\n✅ Migration v2 concluída!\n')
  client.release()
  pool.end()
}).catch(err => { console.error('Erro:', err.message); process.exit(1) })