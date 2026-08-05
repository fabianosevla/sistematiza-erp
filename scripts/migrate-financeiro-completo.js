// scripts/migrate-financeiro-completo.js
//
// Cria o Financeiro Completo em cada tenant: Contas a Pagar, Contas a Receber,
// Contas Bancárias e Extrato Bancário — mais as três colunas de flag que
// controlam a exibição das abas.
//
// Por que agora: a entrega de pedido passou a gerar uma conta a receber. Sem
// a tabela t_conta_receber, o INSERT falha, a transação sofre rollback e a
// entrega não acontece. Esta migration é pré-requisito daquele fluxo.
//
// As definições espelham lib/db/schemas/financeiro-completo.ts. Valores em
// CENTAVOS (integer), como no resto do sistema.
//
// Idempotente: roda quantas vezes quiser.
//
//   node scripts/migrate-financeiro-completo.js            → simula
//   node scripts/migrate-financeiro-completo.js --apply    → aplica
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

const APLICAR = process.argv.includes('--apply')

function conexao() {
  if (process.env.DATABASE_URL) return { connectionString: process.env.DATABASE_URL }
  const host = process.env.DB_HOST
  if (!host) throw new Error('Defina DATABASE_URL ou DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD no .env.local')
  const local = /^(localhost|127\.0\.0\.1)$/.test(host)
  return {
    host,
    port:     Number(process.env.DB_PORT ?? 5432),
    database: process.env.DB_NAME,
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl:      local ? false : { rejectUnauthorized: false },
  }
}

// Colunas de auditoria, iguais às do resto do sistema.
const AUDIT = `
  modification_num INTEGER     NOT NULL DEFAULT 0,
  created_dt       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by       INTEGER     NOT NULL DEFAULT 1,
  updated_dt       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by       INTEGER     NOT NULL DEFAULT 1,
  active_flg       BOOLEAN     NOT NULL DEFAULT TRUE
`

function tabelas(schema) {
  return [
    {
      nome: 't_conta_pagar',
      ddl: `
        CREATE TABLE IF NOT EXISTS "${schema}".t_conta_pagar (
          conta_pagar_id    SERIAL PRIMARY KEY,
          ${AUDIT},
          descricao         VARCHAR(300) NOT NULL,
          fornecedor_id     INTEGER,
          nome_fornecedor   VARCHAR(200),
          categoria         VARCHAR(100),
          numero_documento  VARCHAR(50),
          valor_original    INTEGER NOT NULL,
          valor_pago        INTEGER NOT NULL DEFAULT 0,
          data_emissao      DATE NOT NULL,
          data_vencimento   DATE NOT NULL,
          data_pagamento    DATE,
          status            VARCHAR(20) NOT NULL DEFAULT 'aberta',
          forma_pagamento   VARCHAR(50),
          observacao        VARCHAR(500),
          origem            VARCHAR(20) NOT NULL DEFAULT 'manual',
          origem_id         INTEGER,
          parcela_atual     INTEGER NOT NULL DEFAULT 1,
          total_parcelas    INTEGER NOT NULL DEFAULT 1,
          conta_pai_id      INTEGER,
          conta_bancaria_id INTEGER
        )`,
      indices: [
        `CREATE INDEX IF NOT EXISTS ix_conta_pagar_venc   ON "${schema}".t_conta_pagar (data_vencimento)`,
        `CREATE INDEX IF NOT EXISTS ix_conta_pagar_status ON "${schema}".t_conta_pagar (status)`,
      ],
    },
    {
      nome: 't_conta_receber',
      ddl: `
        CREATE TABLE IF NOT EXISTS "${schema}".t_conta_receber (
          conta_receber_id  SERIAL PRIMARY KEY,
          ${AUDIT},
          descricao         VARCHAR(300) NOT NULL,
          cliente_id        INTEGER,
          nome_cliente      VARCHAR(200),
          categoria         VARCHAR(100),
          numero_documento  VARCHAR(50),
          valor_original    INTEGER NOT NULL,
          valor_recebido    INTEGER NOT NULL DEFAULT 0,
          data_emissao      DATE NOT NULL,
          data_vencimento   DATE NOT NULL,
          data_recebimento  DATE,
          status            VARCHAR(20) NOT NULL DEFAULT 'aberta',
          forma_recebimento VARCHAR(50),
          observacao        VARCHAR(500),
          origem            VARCHAR(20) NOT NULL DEFAULT 'manual',
          origem_id         INTEGER,
          parcela_atual     INTEGER NOT NULL DEFAULT 1,
          total_parcelas    INTEGER NOT NULL DEFAULT 1,
          conta_pai_id      INTEGER,
          conta_bancaria_id INTEGER
        )`,
      indices: [
        `CREATE INDEX IF NOT EXISTS ix_conta_receber_venc   ON "${schema}".t_conta_receber (data_vencimento)`,
        `CREATE INDEX IF NOT EXISTS ix_conta_receber_status ON "${schema}".t_conta_receber (status)`,
        // A entrega de pedido grava origem='pedido' e origem_id=pedido_id.
        // O índice serve para achar a conta a partir do pedido.
        `CREATE INDEX IF NOT EXISTS ix_conta_receber_origem ON "${schema}".t_conta_receber (origem, origem_id)`,
      ],
    },
    {
      nome: 't_conta_bancaria',
      ddl: `
        CREATE TABLE IF NOT EXISTS "${schema}".t_conta_bancaria (
          conta_bancaria_id SERIAL PRIMARY KEY,
          ${AUDIT},
          nome          VARCHAR(100) NOT NULL,
          banco         VARCHAR(100),
          agencia       VARCHAR(20),
          conta         VARCHAR(30),
          tipo          VARCHAR(20) NOT NULL DEFAULT 'corrente',
          saldo_inicial INTEGER NOT NULL DEFAULT 0
        )`,
      indices: [],
    },
    {
      nome: 't_extrato_bancario',
      ddl: `
        CREATE TABLE IF NOT EXISTS "${schema}".t_extrato_bancario (
          extrato_id          SERIAL PRIMARY KEY,
          ${AUDIT},
          conta_bancaria_id   INTEGER NOT NULL,
          data_movimento      DATE NOT NULL,
          descricao           VARCHAR(300),
          valor               INTEGER NOT NULL,
          tipo                VARCHAR(10) NOT NULL,
          referencia          VARCHAR(100),
          status              VARCHAR(20) NOT NULL DEFAULT 'pendente',
          conciliado_com_tipo VARCHAR(20),
          conciliado_com_id   INTEGER,
          importacao_lote     VARCHAR(50)
        )`,
      indices: [
        `CREATE INDEX IF NOT EXISTS ix_extrato_conta ON "${schema}".t_extrato_bancario (conta_bancaria_id, data_movimento)`,
      ],
    },
  ]
}

const FLAGS = [
  ['contas_pagar_ativo',         'BOOLEAN NOT NULL DEFAULT FALSE'],
  ['contas_receber_ativo',       'BOOLEAN NOT NULL DEFAULT FALSE'],
  ['conciliacao_bancaria_ativo', 'BOOLEAN NOT NULL DEFAULT FALSE'],
]

async function main() {
  const pool   = new Pool(conexao())
  const client = await pool.connect()

  try {
    const { rows: schemas } = await client.query(`
      SELECT schema_name FROM information_schema.schemata
      WHERE schema_name LIKE 'tenant\\_%' ESCAPE '\\'
      ORDER BY schema_name
    `)

    console.log(`${schemas.length} tenant(s)${APLICAR ? '' : ' — SIMULAÇÃO, nada será gravado'}\n`)

    for (const { schema_name: schema } of schemas) {
      console.log(`── ${schema}`)

      // 1. Tabelas
      for (const t of tabelas(schema)) {
        const { rows } = await client.query(`
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = $1 AND table_name = $2
        `, [schema, t.nome])

        if (rows.length > 0) {
          console.log(`   já existe: ${t.nome}`)
        } else {
          console.log(`   criar:     ${t.nome}`)
          if (APLICAR) await client.query(t.ddl)
        }
        if (APLICAR) {
          for (const ix of t.indices) await client.query(ix)
        }
      }

      // 2. Colunas de flag em t_configuracoes_tenant
      const { rows: cols } = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 't_configuracoes_tenant'
      `, [schema])
      const existentes = new Set(cols.map(r => r.column_name))

      for (const [col, tipo] of FLAGS) {
        if (existentes.has(col)) {
          console.log(`   já existe: ${col}`)
          continue
        }
        console.log(`   criar:     ${col}`)
        if (APLICAR) {
          await client.query(
            `ALTER TABLE "${schema}".t_configuracoes_tenant ADD COLUMN IF NOT EXISTS ${col} ${tipo}`
          )
        }
      }

      // 3. Contas a Receber LIGADA por padrão.
      //    A entrega de pedido passou a gravar nessa tabela; deixar a aba
      //    escondida faria o lançamento existir sem lugar para ser visto.
      //    Para desligar, use Configurações → Habilitações de módulos.
      console.log('   ligar:     contas_receber_ativo = true')
      if (APLICAR) {
        await client.query(
          `UPDATE "${schema}".t_configuracoes_tenant SET contas_receber_ativo = TRUE`
        ).catch(e => console.log(`     (falhou: ${e.message})`))
      }

      console.log('')
    }

    console.log(APLICAR ? 'Concluído.' : 'Simulação concluída. Rode com --apply para gravar.')
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch(err => { console.error(err); process.exit(1) })