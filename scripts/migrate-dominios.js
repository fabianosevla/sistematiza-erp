require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

const pool = new Pool({
  host: process.env.DB_HOST, port: 5432,
  database: process.env.DB_NAME, user: process.env.DB_USER,
  password: process.env.DB_PASSWORD, ssl: { rejectUnauthorized: false },
})

const SCHEMA = 'tenant_zaghi_massas_caseiras'

const DOMINIOS = [
  {
    codigo: 'tipo_produto', nome: 'Tipos de Produto',
    descricao: 'Cadastro de Produtos → campo Tipo',
    valores: ['Massa', 'Molho', 'Acompanhamento', 'Bebida', 'Outro'],
  },
  {
    codigo: 'tipo_insumo', nome: 'Tipos de Insumo',
    descricao: 'Cadastro de Insumos → campo Tipo',
    valores: ['Matéria Prima', 'Embalagem', 'Limpeza', 'Higiene', 'Outros'],
  },
  {
    codigo: 'unidade_medida', nome: 'Unidades de Medida',
    descricao: 'Produtos, Insumos e Ficha Técnica → campo Unidade',
    valores: ['kg', 'g', 'l', 'ml', 'un', 'cx', 'sc', 'fd', 'dz', 'pc'],
  },
  {
    codigo: 'categoria_despesa', nome: 'Categorias de Despesa',
    descricao: 'Financeiro → Nova Despesa → campo Categoria',
    valores: ['Matéria Prima', 'Embalagem', 'Entrega / Frete', 'Funcionários', 'Aluguel', 'Energia / Água', 'Marketing', 'Impostos', 'Manutenção', 'Outros'],
  },
  {
    codigo: 'tipo_entrega', nome: 'Tipos de Entrega',
    descricao: 'Vendas → Nova Venda → campo Tipo de Entrega',
    valores: ['Retirada', 'Entrega', 'Transportadora'],
  },
  {
    codigo: 'periodo_recorrencia', nome: 'Períodos de Recorrência',
    descricao: 'Financeiro → Nova Despesa Recorrente → campo Período',
    valores: ['Mensal', 'Semanal', 'Anual'],
  },
  {
    codigo: 'tipo_pedido', nome: 'Tipos de Pedido',
    descricao: 'Pedidos → campo Tipo',
    valores: ['Pedido Fábrica', 'Pedido Loja', 'Pedido Delivery', 'Pedido Atacado'],
  },
  {
    codigo: 'tipo_pessoa', nome: 'Tipos de Pessoa',
    descricao: 'Clientes e Fornecedores → campo Tipo',
    valores: ['Pessoa Física', 'Pessoa Jurídica'],
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
  console.log('✓ t_dominio OK')

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
  console.log('✓ t_dominio_valor OK\n')

  for (const dom of DOMINIOS) {
    await client.query(
      `INSERT INTO t_dominio (codigo, nome, descricao, sistema)
       VALUES ($1, $2, $3, true)
       ON CONFLICT (codigo) DO UPDATE SET nome = $2, descricao = $3`,
      [dom.codigo, dom.nome, dom.descricao]
    )
    const { rows } = await client.query(`SELECT dominio_id FROM t_dominio WHERE codigo = $1`, [dom.codigo])
    const dominioId = rows[0].dominio_id

    for (let i = 0; i < dom.valores.length; i++) {
      await client.query(`
        INSERT INTO t_dominio_valor (dominio_id, valor, ordem)
        SELECT $1, $2, $3
        WHERE NOT EXISTS (
          SELECT 1 FROM t_dominio_valor WHERE dominio_id = $1 AND valor = $2 AND active_flg = true
        )
      `, [dominioId, dom.valores[i], i])
    }
    console.log(`✓ ${dom.nome} (${dom.valores.length} valores)`)
  }

  console.log('\n✅ Concluído!\n')
  client.release(); pool.end()
}).catch(err => { console.error('Erro:', err.message); process.exit(1) })