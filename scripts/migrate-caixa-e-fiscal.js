// scripts/migrate-caixa-e-fiscal.js
//
// FECHA AS LACUNAS DE CAIXA E DE FISCAL ENCONTRADAS NA AUDITORIA.
//
// ─── 1. PIS E COFINS NO ITEM DA NOTA ────────────────────────────────────────
//
// O perfil tributario guarda CST e aliquota de PIS e COFINS, mas
// t_nota_fiscal_item nao tinha onde receber. O dado ficava no cadastro e nunca
// chegava na nota — e a emissao mandava '07' fixo para todo mundo, que
// significa isento. Alimento com aliquota zero e alimento tributado sairiam
// identicos, e ninguem perceberia.
//
// origem tambem entra aqui: a nota precisa dizer se a mercadoria e nacional ou
// importada, e isso vem do produto.
//
// ─── 2. DE QUAL CAIXA SAIU A VENDA ──────────────────────────────────────────
//
// Sem turno_id e numero_caixa em t_venda, e impossivel dizer em qual maquina
// faltou dinheiro no fechamento. Pior: com varios turnos abertos ao mesmo
// tempo, um relatorio que filtra por janela de horario mostra o faturamento da
// loja inteira em cada caixa — cinco relatorios identicos e todos errados.
//
// ─── 3. SANGRIA E SUPRIMENTO ────────────────────────────────────────────────
//
// Retirar dinheiro para o cofre no meio do dia e operacao normal. Sem
// registro, toda retirada legitima vira falta no fechamento, e o operador leva
// bronca por dinheiro que foi guardado corretamente.
//
// ─── 4. REGIME DE TURNO ─────────────────────────────────────────────────────
//
// 'dia'      — um turno por vez, a loja inteira vende nele
// 'operador' — um turno por caixa, cada um responde pelo seu
//
// A tabela ja aguentava os dois; faltava a chave que decide, e faltava o
// abrirTurno parar de recusar o segundo turno simultaneo.
//
//   node scripts/migrate-caixa-e-fiscal.js            (simula)
//   node scripts/migrate-caixa-e-fiscal.js --aplicar  (grava)
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

const APLICAR = process.argv.includes('--aplicar')

const COLUNAS = {
  t_nota_fiscal_item: [
    ['cst_pis',     "VARCHAR(2)"],
    ['aliq_pis',    "NUMERIC(5,4) NOT NULL DEFAULT 0"],
    ['valor_pis',   "INTEGER NOT NULL DEFAULT 0"],
    ['cst_cofins',  "VARCHAR(2)"],
    ['aliq_cofins', "NUMERIC(5,4) NOT NULL DEFAULT 0"],
    ['valor_cofins',"INTEGER NOT NULL DEFAULT 0"],
    ['origem',      "VARCHAR(1) DEFAULT '0'"],
    ['cest',        "VARCHAR(10)"],
  ],
  t_venda: [
    ['turno_id',     'INTEGER'],
    ['numero_caixa', 'INTEGER'],
  ],
  t_configuracoes_tenant: [
    // dia | operador
    ['regime_turno', "VARCHAR(10) NOT NULL DEFAULT 'dia'"],
  ],
  t_turno_caixa: [
    // Preenchido no fechamento: o que o sistema calculou que deveria haver.
    // Guardado, e nao recalculado depois, porque venda cancelada mais tarde
    // mudaria o "esperado" de um turno ja conferido e assinado.
    ['valor_esperado', 'INTEGER'],
    ['diferenca',      'INTEGER'],
  ],
}

const MOVIMENTO = `
  CREATE TABLE IF NOT EXISTS t_movimento_caixa (
    movimento_id     SERIAL PRIMARY KEY,
    modification_num INTEGER NOT NULL DEFAULT 0,
    created_dt       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by       INTEGER NOT NULL DEFAULT 1,
    updated_dt       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by       INTEGER NOT NULL DEFAULT 1,
    active_flg       BOOLEAN NOT NULL DEFAULT TRUE,

    turno_id         INTEGER NOT NULL,
    -- sangria    = saiu da gaveta (cofre, banco, pagamento)
    -- suprimento = entrou na gaveta (troco)
    tipo             VARCHAR(12) NOT NULL,
    valor            INTEGER NOT NULL,
    motivo           VARCHAR(300),
    ocorrido_em      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`

function conexao() {
  if (process.env.DATABASE_URL) return { connectionString: process.env.DATABASE_URL }
  const host = process.env.DB_HOST
  if (!host) throw new Error('Defina DATABASE_URL ou DB_HOST/... no .env.local')
  const local = /^(localhost|127\.0\.0\.1)$/.test(host)
  return {
    host, port: Number(process.env.DB_PORT ?? 5432),
    database: process.env.DB_NAME, user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: local ? false : { rejectUnauthorized: false },
  }
}

async function main() {
  const pool = new Pool(conexao())
  const c    = await pool.connect()
  try {
    const { rows: schemas } = await c.query(`
      SELECT schema_name FROM information_schema.schemata
      WHERE schema_name LIKE 'tenant\\_%' ESCAPE '\\' ORDER BY schema_name
    `)
    console.log(APLICAR ? '\n>>> MODO GRAVACAO\n' : '\n>>> SIMULACAO — nada sera gravado. Use --aplicar.\n')

    for (const { schema_name: schema } of schemas) {
      console.log(`\n${'='.repeat(66)}\n${schema}\n${'='.repeat(66)}`)
      await c.query(`SET search_path TO "${schema}", public`)

      // Tabela de movimentos
      const temMov = await c.query(`SELECT to_regclass('t_movimento_caixa') IS NOT NULL AS e`)
      if (temMov.rows[0].e)   console.log('  t_movimento_caixa: ja existe.')
      else if (!APLICAR)      console.log('  t_movimento_caixa: seria criada.')
      else { await c.query(MOVIMENTO); console.log('  t_movimento_caixa: criada.') }

      for (const [tabela, colunas] of Object.entries(COLUNAS)) {
        const existe = await c.query(`SELECT to_regclass($1) IS NOT NULL AS e`, [tabela])
        if (!existe.rows[0].e) { console.log(`  ${tabela}: nao existe. Pulando.`); continue }

        const { rows: atuais } = await c.query(`
          SELECT column_name FROM information_schema.columns
           WHERE table_schema = $1 AND table_name = $2
        `, [schema, tabela])
        const jaTem = new Set(atuais.map(r => r.column_name))
        const faltando = colunas.filter(([n]) => !jaTem.has(n))

        if (faltando.length === 0) { console.log(`  ${tabela}: completa.`); continue }
        if (!APLICAR) { console.log(`  ${tabela}: criaria ${faltando.map(([n]) => n).join(', ')}`); continue }

        for (const [nome, tipo] of faltando) {
          await c.query(`ALTER TABLE "${tabela}" ADD COLUMN ${nome} ${tipo}`)
        }
        console.log(`  ${tabela}: ${faltando.length} coluna(s) criada(s).`)
      }

      // Indice: o relatorio de caixa busca venda por turno o tempo todo.
      if (APLICAR) {
        await c.query(`CREATE INDEX IF NOT EXISTS ix_venda_turno ON t_venda (turno_id)`)
        await c.query(`CREATE INDEX IF NOT EXISTS ix_mov_caixa_turno ON t_movimento_caixa (turno_id)`)
      }
    }
    console.log(APLICAR ? '\nOK.' : '\nNada gravado. Rode com --aplicar.')
  } finally {
    c.release()
    await pool.end()
  }
}
main().catch(e => { console.error('\nERRO:', e.message); process.exit(1) })
