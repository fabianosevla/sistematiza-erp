require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

const pool = new Pool({
  host: process.env.DB_HOST,
  port: 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
})

const SCHEMA = 'tenant_zaghi_massas_caseiras'

pool.connect().then(async client => {
  console.log(`\nMigrando schema: ${SCHEMA}\n`)
  await client.query(`SET search_path TO "${SCHEMA}", public`)

  await client.query(`
    CREATE TABLE IF NOT EXISTS t_fornecedor (
      fornecedor_id SERIAL PRIMARY KEY,
      modification_num INTEGER NOT NULL DEFAULT 0,
      created_dt TIMESTAMPTZ NOT NULL,
      created_by INTEGER NOT NULL,
      updated_dt TIMESTAMPTZ NOT NULL,
      updated_by INTEGER NOT NULL,
      active_flg BOOLEAN NOT NULL DEFAULT TRUE,
      tipo_pessoa VARCHAR(2) NOT NULL DEFAULT 'PJ',
      nome_completo VARCHAR(200) NOT NULL,
      nome_fantasia VARCHAR(200),
      cnpj_cpf VARCHAR(20),
      email VARCHAR(150),
      telefone VARCHAR(20),
      celular VARCHAR(20),
      contato VARCHAR(100),
      cep VARCHAR(10),
      endereco VARCHAR(200),
      numero VARCHAR(10),
      complemento VARCHAR(100),
      bairro VARCHAR(100),
      cidade VARCHAR(100),
      uf VARCHAR(2),
      observacao VARCHAR(500)
    )
  `)
  console.log('✓ t_fornecedor criada')

  await client.query(`
    CREATE TABLE IF NOT EXISTS t_produto (
      produto_id SERIAL PRIMARY KEY,
      modification_num INTEGER NOT NULL DEFAULT 0,
      created_dt TIMESTAMPTZ NOT NULL,
      created_by INTEGER NOT NULL,
      updated_dt TIMESTAMPTZ NOT NULL,
      updated_by INTEGER NOT NULL,
      active_flg BOOLEAN NOT NULL DEFAULT TRUE,
      nome VARCHAR(200) NOT NULL,
      descricao VARCHAR(500),
      codigo_barras VARCHAR(50),
      unidade VARCHAR(20) NOT NULL DEFAULT 'un',
      categoria VARCHAR(100),
      estoque_atual INTEGER NOT NULL DEFAULT 0,
      estoque_minimo INTEGER NOT NULL DEFAULT 0,
      preco_custo INTEGER NOT NULL DEFAULT 0,
      preco_varejo INTEGER NOT NULL DEFAULT 0,
      preco_atacado INTEGER NOT NULL DEFAULT 0
    )
  `)
  console.log('✓ t_produto criada')

  await client.query(`
    CREATE TABLE IF NOT EXISTS t_insumo (
      insumo_id SERIAL PRIMARY KEY,
      modification_num INTEGER NOT NULL DEFAULT 0,
      created_dt TIMESTAMPTZ NOT NULL,
      created_by INTEGER NOT NULL,
      updated_dt TIMESTAMPTZ NOT NULL,
      updated_by INTEGER NOT NULL,
      active_flg BOOLEAN NOT NULL DEFAULT TRUE,
      nome VARCHAR(200) NOT NULL,
      descricao VARCHAR(500),
      codigo_barras VARCHAR(50),
      unidade VARCHAR(20) NOT NULL DEFAULT 'kg',
      tipo VARCHAR(20) NOT NULL DEFAULT 'MP',
      estoque_atual INTEGER NOT NULL DEFAULT 0,
      estoque_minimo INTEGER NOT NULL DEFAULT 0,
      preco_custo INTEGER NOT NULL DEFAULT 0,
      fornecedor_id INTEGER
    )
  `)
  console.log('✓ t_insumo criada')

  console.log('\n✅ Migração concluída!\n')
  client.release()
  pool.end()
}).catch(err => {
  console.error('Erro:', err.message)
  process.exit(1)
})