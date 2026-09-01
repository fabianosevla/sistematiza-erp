/**
 * Migration: tabela de referência de NCM + CSOSN/CST sugerido em outras
 * operações + tela de registro de operação fiscal (devolução, transferência,
 * bonificação etc.)
 *
 * - t_ncm_referencia: busca de NCM por palavra-chave. Curada, não é a
 *   tabela oficial inteira (~10 mil códigos) — cresce conforme alguém
 *   cadastra, igual t_cfop_regra.
 * - t_cfop_regra ganha csosn_sugerido/cst_sugerido: pra "outras operações"
 *   poderem gerar nota de verdade sem inventar tributação.
 * - t_nota_fiscal ganha cfop_regra_id: liga a nota de uma operação não-venda
 *   à regra que a originou (auditoria — de onde veio aquele CFOP).
 *
 * Idempotente: usa IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.
 *
 * Rodar: node scripts/migrate-ncm-referencia-e-operacoes.js
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

// Curada a partir do que já foi conferido em pesquisa real nesta sessão —
// fonte anotada em cada linha, não é a tabela oficial completa.
const NCM_SEED = [
  ['19011000', 'Preparações para alimentação de crianças, acondicionadas para venda a retalho', null, 'Tabela oficial NCM/TIPI'],
  ['19012000', 'Misturas e pastas para preparação de produtos de padaria/pastelaria (inclui pão de queijo cru congelado)', null, 'Solução de Consulta COSIT 98.234/2023'],
  ['19021100', 'Massas alimentícias não cozidas, com ovos', '17.049.06', 'Uso corrente em massas frescas com ovo'],
  ['19021900', 'Massas alimentícias não cozidas, sem ovos (inclui massa de pastel crua sem recheio)', null, 'Consulta fiscal sobre massa de pastel'],
  ['19022000', 'Massas alimentícias recheadas, mesmo cozidas ou preparadas de outro modo', '17.048.02', 'Uso corrente em massas recheadas (rondelli, canelone, sorrentino)'],
  ['19023000', 'Outras massas alimentícias (nhoque e similares)', '17.047.00', 'Uso corrente'],
  ['19051000', 'Pão denominado knäckebrot', null, 'Tabela oficial NCM/TIPI'],
  ['19059090', 'Outros produtos de padaria, pastelaria e da indústria de bolachas e biscoitos (pão de queijo já assado)', null, 'Solução de Consulta COSIT 98.040/2025'],
  ['16023200', 'Preparações de carne de galo/galinha (pastel/salgado recheado de frango)', null, 'Consulta fiscal sobre salgados recheados'],
  ['16025000', 'Preparações de carne bovina (pastel/salgado recheado de carne)', null, 'Consulta fiscal sobre salgados recheados'],
  ['21039021', 'Molhos e preparações para molhos, à base de tomate', null, 'Uso corrente em molhos prontos'],
  ['21039091', 'Outros molhos e preparações para molhos', null, 'Uso corrente em molhos prontos'],
  ['04061090', 'Queijo fresco (não curado), não ralado nem em pó', null, 'Tabela oficial NCM/TIPI'],
  ['04062000', 'Queijos ralados ou em pó, de qualquer tipo', null, 'Tabela oficial NCM/TIPI'],
  ['22042100', 'Vinho de uvas frescas, em recipientes de capacidade não superior a 2 litros', '02.024.00', 'Tabela oficial NCM/TIPI; CEST bebidas quentes'],
  ['22030000', 'Cervejas de malte', null, 'Tabela oficial NCM/TIPI — CEST varia por tipo, ver tabela de bebidas'],
]

// t_cfop_regra hoje: rótulos livres, mas sem CSOSN/CST — a nota de operação
// não tem como sair sem esse campo. Sugestões de mercado, sinalizadas como
// tal — cada tenant confirma com o próprio contador antes de usar.
// CSOSN 400 = "não tributada pelo Simples Nacional" — pesquisa confirmou uso
// corrente em remessa/retorno de industrialização e conserto, bonificação,
// doação, comodato e transferência (operações que movem mercadoria sem ser
// venda de fato). Devolução e compra de uso/consumo/ativo ficam com 102 por
// serem mais próximas de operação comercial normal — mas TODAS são
// sugestão de mercado, não confirmação de contador.
const CSOSN_SUGERIDO = {
  'Devolução de venda':                                          '102',
  'Devolução de compra':                                         '102',
  'Bonificação, doação ou brinde':                                '400',
  'Remessa para industrialização por encomenda':                  '400',
  'Retorno de industrialização':                                  '400',
  'Remessa para conserto ou reparo':                              '400',
  'Retorno de conserto ou reparo':                                '400',
  'Transferência entre estabelecimentos (produção própria)':      '400',
  'Transferência entre estabelecimentos (mercadoria adquirida)':  '400',
  'Remessa em consignação':                                       '400',
  'Devolução de mercadoria em consignação':                       '400',
  'Compra para uso e consumo':                                    '102',
  'Compra de ativo imobilizado':                                  '102',
}

async function migrarSchema(client, schema) {
  await client.query(`SET search_path TO "${schema}", public`)

  await client.query(`
    CREATE TABLE IF NOT EXISTS t_ncm_referencia (
      ncm_ref_id        SERIAL PRIMARY KEY,
      modification_num  INTEGER      NOT NULL DEFAULT 0,
      created_dt        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      created_by        INTEGER      NOT NULL DEFAULT 1,
      updated_dt        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_by        INTEGER      NOT NULL DEFAULT 1,
      active_flg        BOOLEAN      NOT NULL DEFAULT TRUE,

      ncm               VARCHAR(10)  NOT NULL,
      descricao         VARCHAR(400) NOT NULL,
      cest_sugerido     VARCHAR(20),
      fonte             VARCHAR(300)
    )
  `)
  await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS ux_ncm_referencia_ncm ON t_ncm_referencia (ncm) WHERE active_flg = true`)

  await client.query(`ALTER TABLE t_cfop_regra ADD COLUMN IF NOT EXISTS csosn_sugerido VARCHAR(4)`)
  await client.query(`ALTER TABLE t_cfop_regra ADD COLUMN IF NOT EXISTS cst_sugerido    VARCHAR(3)`)
  await client.query(`ALTER TABLE t_nota_fiscal ADD COLUMN IF NOT EXISTS cfop_regra_id INTEGER`)

  const existentes = await client.query(`SELECT COUNT(*)::int AS n FROM t_ncm_referencia`)
  if (existentes.rows[0].n === 0) {
    for (const [ncm, descricao, cest, fonte] of NCM_SEED) {
      await client.query(
        `INSERT INTO t_ncm_referencia (ncm, descricao, cest_sugerido, fonte) VALUES ($1,$2,$3,$4)`,
        [ncm, descricao, cest, fonte]
      )
    }
  }

  for (const [tipo, csosn] of Object.entries(CSOSN_SUGERIDO)) {
    await client.query(
      `UPDATE t_cfop_regra SET csosn_sugerido = $1 WHERE tipo_operacao = $2 AND csosn_sugerido IS NULL`,
      [csosn, tipo]
    )
  }
}

pool.connect().then(async client => {
  const res = await client.query(`
    SELECT schema_name FROM information_schema.schemata
    WHERE schema_name LIKE 'tenant_%'
    ORDER BY schema_name
  `)
  const schemas = res.rows.map(r => r.schema_name)
  console.log(`\nNCM/operações: migrando ${schemas.length} schema(s) de tenant...\n`)

  for (const schema of schemas) {
    try {
      await migrarSchema(client, schema)
      console.log(`  ✓ ${schema}`)
    } catch (e) {
      console.error(`  ✗ ${schema}: ${e.message}`)
    }
  }

  console.log('\n✅ Migration concluída!\n')
  client.release()
  pool.end()
}).catch(err => { console.error('Erro:', err.message); process.exit(1) })
