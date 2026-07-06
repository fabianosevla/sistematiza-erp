require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')
const pool = new Pool({
  host: process.env.DB_HOST, port: 5432,
  database: process.env.DB_NAME, user: process.env.DB_USER,
  password: process.env.DB_PASSWORD, ssl: { rejectUnauthorized: false }
})

const SCHEMA = 'tenant_zaghi_massas_caseiras'

pool.connect().then(async client => {
  await client.query(`SET search_path TO "${SCHEMA}", public`)

  console.log('Iniciando reset de dados do tenant...')
  console.log('Schema:', SCHEMA)
  console.log('')

  // Ordem importante: filhos antes de pais (FK)
  const tabelas = [
    // Vendas
    't_venda_pagamento',
    't_venda_item',
    't_venda',
    // Pedidos
    't_pedido_item',
    't_pedido',
    // Compras
    't_compra_insumo',
    // Financeiro
    't_despesa',
    't_gasto_fixo_valor',
    // Estoque / Produção
    't_producao_grade',
    // Fichas técnicas
    't_produto_insumo',
    // Cadastros (produtos e insumos)
    't_insumo',
    't_produto',
    't_cliente',
    't_fornecedor',
  ]

  for (const tabela of tabelas) {
    try {
      const r = await client.query(`DELETE FROM ${tabela}`)
      console.log(`✓ ${tabela}: ${r.rowCount} registros removidos`)
    } catch (e) {
      console.log(`⚠ ${tabela}: ${e.message}`)
    }
  }

  // Resetar sequences para começar do 1
  const sequences = [
    'seq_venda_pagamento_id', 'seq_venda_item_id', 'seq_venda_id',
    'seq_pedido_item_id', 'seq_pedido_id',
    'seq_compra_insumo_id',
    'seq_despesa_id',
    'seq_gasto_fixo_valor_id',
    'seq_producao_grade_id',
    'seq_produto_insumo_id',
    'seq_insumo_id', 'seq_produto_id',
    'seq_cliente_id', 'seq_fornecedor_id',
  ]

  console.log('')
  console.log('Resetando sequences...')
  for (const seq of sequences) {
    try {
      await client.query(`ALTER SEQUENCE IF EXISTS ${seq} RESTART WITH 1`)
      console.log(`✓ ${seq}`)
    } catch (e) {
      // ignora sequences que não existem
    }
  }

  // Também resetar via tabela (caso as sequences tenham outro nome)
  try {
    const seqRes = await client.query(`
      SELECT sequence_name FROM information_schema.sequences
      WHERE sequence_schema = $1
    `, [SCHEMA])
    for (const row of seqRes.rows) {
      await client.query(`ALTER SEQUENCE "${SCHEMA}".${row.sequence_name} RESTART WITH 1`)
      console.log(`✓ reset: ${row.sequence_name}`)
    }
  } catch (e) {
    console.log('Sequences resetadas via schema')
  }

  console.log('')
  console.log('✓ Reset concluído!')
  console.log('Preservados: t_usuario, t_perfil_acesso, t_configuracoes_tenant, t_dominio, t_dominio_valor, t_gasto_fixo_categoria, t_forma_pagamento')

  client.release()
  pool.end()
}).catch(err => {
  console.error('ERRO:', err.message)
  process.exit(1)
})