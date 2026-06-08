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

const DOMINIOS = [
  {
    codigo:   'tipo_produto',
    nome:     'Tipos de Produto',
    descricao:'Categorias no cadastro de produtos',
    valores:  ['Massa', 'Molho', 'Acompanhamento', 'Bebida', 'Outro'],
  },
  {
    codigo:   'tipo_insumo',
    nome:     'Tipos de Insumo',
    descricao:'Categorias no cadastro de insumos',
    valores:  ['Matéria Prima', 'Embalagem', 'Limpeza', 'Outros'],
  },
  {
    codigo:   'unidade_medida',
    nome:     'Unidades de Medida',
    descricao:'Unidades usadas em produtos, insumos e fichas técnicas',
    valores:  ['kg', 'g', 'l', 'ml', 'un', 'cx', 'sc', 'fd'],
  },
  {
    codigo:   'categoria_despesa',
    nome:     'Categorias de Despesa',
    descricao:'Categorias no lançamento de despesas financeiras',
    valores:  ['Matéria Prima', 'Embalagem', 'Entrega / Frete', 'Funcionários', 'Aluguel', 'Energia / Água', 'Marketing', 'Impostos', 'Outros'],
  },
]

pool.connect().then(async client => {
  console.log(`\nMigrando Domínios no schema: ${SCHEMA}\n`)
  await client.query(`SET search_path TO "${SCHEMA}", public`)

  await client.query(`
    CREATE TABLE IF NOT EXISTS t_dominio (
      dominio_id       SERIAL PRIMARY KEY,
      modification_num INTEGER NOT NULL DEFAULT 0,
      created_dt       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by       INTEGER NOT NULL DEFAULT 1,
      updated_dt       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by       INTEGER NOT NULL DEFAULT 1,
      active_flg       BOOLEAN NOT NULL DEFAULT TRUE,
      codigo           VARCHAR(50) NOT NULL UNIQUE,
      nome             VARCHAR(100) NOT NULL,
      descricao        VARCHAR(300),
      sistema          BOOLEAN NOT NULL DEFAULT FALSE
    )
  `)
  console.log('✓ t_dominio criada')

  await client.query(`
    CREATE TABLE IF NOT EXISTS t_dominio_valor (
      valor_id         SERIAL PRIMARY KEY,
      modification_num INTEGER NOT NULL DEFAULT 0,
      created_dt       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by       INTEGER NOT NULL DEFAULT 1,
      updated_dt       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by       INTEGER NOT NULL DEFAULT 1,
      active_flg       BOOLEAN NOT NULL DEFAULT TRUE,
      dominio_id       INTEGER NOT NULL REFERENCES t_dominio(dominio_id),
      valor            VARCHAR(100) NOT NULL,
      ordem            INTEGER NOT NULL DEFAULT 0
    )
  `)
  console.log('✓ t_dominio_valor criada')

  for (const dom of DOMINIOS) {
    await client.query(
      `INSERT INTO t_dominio (codigo, nome, descricao, sistema)
       VALUES ($1, $2, $3, true)
       ON CONFLICT (codigo) DO NOTHING`,
      [dom.codigo, dom.nome, dom.descricao]
    )

    const { rows } = await client.query(
      `SELECT dominio_id FROM t_dominio WHERE codigo = $1`,
      [dom.codigo]
    )
    const dominioId = rows[0].dominio_id

    for (let i = 0; i < dom.valores.length; i++) {
      await client.query(`
        INSERT INTO t_dominio_valor (dominio_id, valor, ordem)
        SELECT $1, $2, $3
        WHERE NOT EXISTS (
          SELECT 1 FROM t_dominio_valor
          WHERE dominio_id = $1 AND valor = $2 AND active_flg = true
        )
      `, [dominioId, dom.valores[i], i])
    }

    console.log(`✓ ${dom.nome} — ${dom.valores.length} valores inseridos`)
  }

  console.log('\n✅ Migration Domínios concluída!\n')
  client.release()
  pool.end()
}).catch(err => {
  console.error('Erro:', err.message)
  process.exit(1)
})