/**
 * Migration: Regras de CFOP para operações que não são venda
 *
 * A venda continua resolvida pelo perfil tributário (t_perfil_tributario),
 * que já existe — o CFOP de venda varia por produto (cada produto tem seu
 * perfil, com CFOP e CSOSN próprios). Esta tabela nova é para as OUTRAS
 * naturezas de operação (devolução, bonificação, transferência, remessa para
 * industrialização/conserto, consignação, compra de uso/consumo e de ativo),
 * onde o CFOP não depende do produto — só do tipo de operação e de a
 * mercadoria ir para dentro ou fora do estado.
 *
 * Semeado com um conjunto realista para indústria/comércio (produção
 * própria predominante, caso da Zaghi). São CFOPs padrão de mercado — vale
 * o contador conferir antes de usar numa emissão real, do mesmo jeito que
 * o resto da parametrização fiscal.
 *
 * Idempotente: usa IF NOT EXISTS pra tabela, e só semeia se a tabela nascer
 * vazia (não duplica se rodar de novo).
 *
 * Rodar: node scripts/migrate-cfop-regras.js
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

const SEED = [
  ['Devolução de venda',                          'entrada', 'interno',       '1201', 'Cliente devolve mercadoria de produção própria vendida'],
  ['Devolução de venda',                          'entrada', 'interestadual', '2201', null],
  ['Devolução de compra',                         'saida',   'interno',       '5202', 'Devolve ao fornecedor mercadoria/insumo comprado para comercialização'],
  ['Devolução de compra',                         'saida',   'interestadual', '6202', null],
  ['Bonificação, doação ou brinde',                'saida',   'interno',       '5910', null],
  ['Bonificação, doação ou brinde',                'saida',   'interestadual', '6910', null],
  ['Remessa para industrialização por encomenda',  'saida',   'interno',       '5901', null],
  ['Remessa para industrialização por encomenda',  'saida',   'interestadual', '6901', null],
  ['Retorno de industrialização',                  'entrada', 'interno',       '1902', null],
  ['Retorno de industrialização',                  'entrada', 'interestadual', '2902', null],
  ['Remessa para conserto ou reparo',              'saida',   'interno',       '5915', null],
  ['Remessa para conserto ou reparo',              'saida',   'interestadual', '6915', null],
  ['Retorno de conserto ou reparo',                'entrada', 'interno',       '1916', null],
  ['Retorno de conserto ou reparo',                'entrada', 'interestadual', '2916', null],
  ['Transferência entre estabelecimentos (produção própria)', 'saida', 'interno',       '5151', null],
  ['Transferência entre estabelecimentos (produção própria)', 'saida', 'interestadual', '6151', null],
  ['Transferência entre estabelecimentos (mercadoria adquirida)', 'saida', 'interno',       '5152', null],
  ['Transferência entre estabelecimentos (mercadoria adquirida)', 'saida', 'interestadual', '6152', null],
  ['Remessa em consignação',                       'saida',   'interno',       '5917', null],
  ['Remessa em consignação',                       'saida',   'interestadual', '6917', null],
  ['Devolução de mercadoria em consignação',       'entrada', 'interno',       '1918', 'Consignatário devolve ao consignante'],
  ['Devolução de mercadoria em consignação',       'entrada', 'interestadual', '2918', null],
  ['Compra para uso e consumo',                    'entrada', 'interno',       '1556', null],
  ['Compra para uso e consumo',                    'entrada', 'interestadual', '2556', null],
  ['Compra de ativo imobilizado',                  'entrada', 'interno',       '1551', null],
  ['Compra de ativo imobilizado',                  'entrada', 'interestadual', '2551', null],
]

async function migrarSchema(client, schema) {
  await client.query(`SET search_path TO "${schema}", public`)

  await client.query(`
    CREATE TABLE IF NOT EXISTS t_cfop_regra (
      cfop_regra_id     SERIAL PRIMARY KEY,
      modification_num  INTEGER      NOT NULL DEFAULT 0,
      created_dt        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      created_by        INTEGER      NOT NULL DEFAULT 1,
      updated_dt        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_by        INTEGER      NOT NULL DEFAULT 1,
      active_flg        BOOLEAN      NOT NULL DEFAULT TRUE,

      tipo_operacao     VARCHAR(100) NOT NULL,
      direcao           VARCHAR(10)  NOT NULL,   -- entrada | saida
      localizacao       VARCHAR(15)  NOT NULL,   -- interno | interestadual
      cfop              VARCHAR(4)   NOT NULL,
      observacao        VARCHAR(500)
    )
  `)
  await client.query(`CREATE INDEX IF NOT EXISTS ix_cfop_regra_tipo ON t_cfop_regra (tipo_operacao)`)

  const existentes = await client.query(`SELECT COUNT(*)::int AS n FROM t_cfop_regra`)
  if (existentes.rows[0].n > 0) return 'já tinha dados — não semeei de novo'

  for (const [tipo, direcao, localizacao, cfop, obs] of SEED) {
    await client.query(
      `INSERT INTO t_cfop_regra (tipo_operacao, direcao, localizacao, cfop, observacao)
       VALUES ($1, $2, $3, $4, $5)`,
      [tipo, direcao, localizacao, cfop, obs]
    )
  }
  return `semeado com ${SEED.length} regras`
}

pool.connect().then(async client => {
  const res = await client.query(`
    SELECT schema_name FROM information_schema.schemata
    WHERE schema_name LIKE 'tenant_%'
    ORDER BY schema_name
  `)
  const schemas = res.rows.map(r => r.schema_name)
  console.log(`\nRegras de CFOP: migrando ${schemas.length} schema(s) de tenant...\n`)

  for (const schema of schemas) {
    try {
      const resultado = await migrarSchema(client, schema)
      console.log(`  ✓ ${schema} — ${resultado}`)
    } catch (e) {
      console.error(`  ✗ ${schema}: ${e.message}`)
    }
  }

  console.log('\n✅ Migration de regras de CFOP concluída!\n')
  client.release()
  pool.end()
}).catch(err => { console.error('Erro:', err.message); process.exit(1) })
