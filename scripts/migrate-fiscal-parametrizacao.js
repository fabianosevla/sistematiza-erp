// scripts/migrate-fiscal-parametrizacao.js
//
// ESTRUTURA DA PARAMETRIZACAO FISCAL.
//
// Cria a tabela de perfis tributarios e acrescenta os campos fiscais que
// faltavam em produto, cliente, venda e configuracoes.
//
// ─── A IDEIA CENTRAL: PERFIL TRIBUTARIO ─────────────────────────────────────
//
// Ninguem preenche NCM, CFOP, CSOSN e aliquota em quinhentos produtos. O
// contador cadastra alguns perfis — "Massa fresca", "Bebida com ST", "Revenda
// isenta" — e cada produto aponta para um. Mudou a regra, muda no perfil, e
// vale para todos.
//
// A divisao entre as tabelas segue o que cada informacao significa:
//
//   PRODUTO  descreve a MERCADORIA:  NCM, CEST, origem, unidade tributavel
//   PERFIL   descreve a TRIBUTACAO:  CFOP, CST/CSOSN, aliquotas, ST
//
// NCM identifica o que a coisa e, e varia produto a produto. Tributacao e
// regra, e se repete. Por isso NCM fica no produto e o resto no perfil.
//
// ─── OS DOIS REGIMES, NA MESMA TABELA ───────────────────────────────────────
//
// Simples Nacional usa CSOSN; Lucro Presumido e Real usam CST. Sao campos
// diferentes para a mesma decisao, e o regime da empresa determina qual vale.
// Guardar os dois na mesma linha permite que o mesmo perfil sirva a empresa
// que mudar de regime — o que acontece — sem recadastrar nada.
//
// ─── VENDA COM E SEM NOTA ───────────────────────────────────────────────────
//
// t_venda.documento_fiscal registra a decisao no momento da venda: nenhum,
// nfce ou nfe. E informacao gerencial: separa o que foi faturado do que nao
// foi, sem interferir na emissao.
//
//   node scripts/migrate-fiscal-parametrizacao.js            (simula)
//   node scripts/migrate-fiscal-parametrizacao.js --aplicar  (grava)
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

const APLICAR = process.argv.includes('--aplicar')

// Colunas acrescentadas em tabelas que ja existem.
const COLUNAS = {
  t_produto: [
    // Nomenclatura Comum do Mercosul: identifica a mercadoria para o fisco.
    ['ncm',                'VARCHAR(10)'],
    // Codigo Especificador da Substituicao Tributaria. So se houver ST.
    ['cest',               'VARCHAR(10)'],
    // 0=nacional, 1=importacao direta, 2=mercado interno importado, ...
    ['origem',             'VARCHAR(1) DEFAULT \'0\''],
    // Unidade que vai na nota, quando difere da unidade de venda.
    ['unidade_tributavel', 'VARCHAR(6)'],
    ['perfil_trib_id',     'INTEGER'],
  ],
  t_cliente: [
    // 1=contribuinte de ICMS, 2=isento, 9=nao contribuinte. Muda o CFOP.
    ['indicador_ie',       'VARCHAR(1) DEFAULT \'9\''],
    ['inscricao_estadual', 'VARCHAR(20)'],
    ['consumidor_final',   'BOOLEAN NOT NULL DEFAULT TRUE'],
  ],
  t_venda: [
    // nenhum | nfce | nfe — decidido no momento da venda.
    ['documento_fiscal',   'VARCHAR(10) NOT NULL DEFAULT \'nenhum\''],
  ],
  t_configuracoes_tenant: [
    // Codigo de Regime Tributario: 1=Simples, 2=Simples com excesso, 3=Normal.
    ['crt',                'VARCHAR(1)'],
    ['serie_nfce',         'VARCHAR(5) DEFAULT \'1\''],
    ['serie_nfe',          'VARCHAR(5) DEFAULT \'1\''],
    // Credenciamento na SEFAZ. Sem isso nao se emite, e o sistema precisa
    // avisar em vez de tentar.
    ['credenciado_nfce',   'BOOLEAN NOT NULL DEFAULT FALSE'],
    ['credenciado_nfe',    'BOOLEAN NOT NULL DEFAULT FALSE'],
    // Mensagem do rodape da nota. No Simples e obrigatoria por lei.
    ['mensagem_fiscal',    'VARCHAR(500)'],
    ['cnae',               'VARCHAR(10)'],
  ],
}

const PERFIL = `
  CREATE TABLE IF NOT EXISTS t_perfil_tributario (
    perfil_trib_id    SERIAL PRIMARY KEY,
    modification_num  INTEGER NOT NULL DEFAULT 0,
    created_dt        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by        INTEGER NOT NULL DEFAULT 1,
    updated_dt        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by        INTEGER NOT NULL DEFAULT 1,
    active_flg        BOOLEAN NOT NULL DEFAULT TRUE,

    nome              VARCHAR(100) NOT NULL,
    descricao         VARCHAR(300),

    -- CFOP muda conforme o destino e quem compra.
    cfop_interno         VARCHAR(4),
    cfop_interestadual   VARCHAR(4),

    -- SIMPLES NACIONAL
    csosn             VARCHAR(4),

    -- REGIME NORMAL
    cst_icms          VARCHAR(3),
    aliq_icms         NUMERIC(5,2) NOT NULL DEFAULT 0,
    red_base_icms     NUMERIC(5,2) NOT NULL DEFAULT 0,

    -- SUBSTITUICAO TRIBUTARIA
    tem_st            BOOLEAN NOT NULL DEFAULT FALSE,
    mva               NUMERIC(6,2) NOT NULL DEFAULT 0,
    aliq_icms_st      NUMERIC(5,2) NOT NULL DEFAULT 0,

    -- PIS / COFINS
    cst_pis           VARCHAR(2),
    aliq_pis          NUMERIC(5,4) NOT NULL DEFAULT 0,
    cst_cofins        VARCHAR(2),
    aliq_cofins       NUMERIC(5,4) NOT NULL DEFAULT 0,

    -- IPI: raro em revenda e comum em industria.
    cst_ipi           VARCHAR(2),
    aliq_ipi          NUMERIC(5,2) NOT NULL DEFAULT 0,

    -- Texto que vai nas informacoes adicionais do item.
    info_adicional    VARCHAR(500)
  )
`

function conexao() {
  if (process.env.DATABASE_URL) return { connectionString: process.env.DATABASE_URL }
  const host = process.env.DB_HOST
  if (!host) throw new Error('Defina DATABASE_URL ou DB_HOST/... no .env.local')
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
      console.log(`\n${'='.repeat(70)}\n${schema}\n${'='.repeat(70)}`)
      await c.query(`SET search_path TO "${schema}", public`)

      // ── Tabela de perfis ──────────────────────────────────────────────────
      const temPerfil = await c.query(`SELECT to_regclass('t_perfil_tributario') IS NOT NULL AS e`)
      if (temPerfil.rows[0].e) {
        console.log('  t_perfil_tributario: ja existe.')
      } else if (!APLICAR) {
        console.log('  t_perfil_tributario: seria criada.')
      } else {
        await c.query(PERFIL)
        console.log('  t_perfil_tributario: criada.')
      }

      // ── Colunas nas tabelas existentes ────────────────────────────────────
      for (const [tabela, colunas] of Object.entries(COLUNAS)) {
        const existe = await c.query(`SELECT to_regclass($1) IS NOT NULL AS e`, [tabela])
        if (!existe.rows[0].e) {
          console.log(`  ${tabela}: tabela nao existe neste schema. Pulando.`)
          continue
        }

        const { rows: atuais } = await c.query(`
          SELECT column_name FROM information_schema.columns
           WHERE table_schema = $1 AND table_name = $2
        `, [schema, tabela])
        const jaTem = new Set(atuais.map(r => r.column_name))

        const faltando = colunas.filter(([nome]) => !jaTem.has(nome))
        if (faltando.length === 0) {
          console.log(`  ${tabela}: todas as colunas ja existem.`)
          continue
        }

        if (!APLICAR) {
          console.log(`  ${tabela}: criaria ${faltando.map(([n]) => n).join(', ')}`)
          continue
        }

        for (const [nome, tipo] of faltando) {
          await c.query(`ALTER TABLE "${tabela}" ADD COLUMN ${nome} ${tipo}`)
        }
        console.log(`  ${tabela}: ${faltando.length} coluna(s) criada(s).`)
      }

      // ── CRT a partir do regime ja cadastrado ──────────────────────────────
      //
      // Quem ja tinha regime_tributario preenchido ganha o CRT correspondente,
      // para nao precisar recadastrar. Simples -> 1, o resto -> 3.
      if (APLICAR) {
        const temCfg = await c.query(`SELECT to_regclass('t_configuracoes_tenant') IS NOT NULL AS e`)
        if (temCfg.rows[0].e) {
          const upd = await c.query(`
            UPDATE t_configuracoes_tenant
               SET crt = CASE
                     WHEN LOWER(COALESCE(regime_tributario, '')) LIKE '%simples%' THEN '1'
                     WHEN COALESCE(regime_tributario, '') = '' THEN NULL
                     ELSE '3' END
             WHERE crt IS NULL
          `)
          if (upd.rowCount > 0) console.log(`  crt preenchido a partir do regime em ${upd.rowCount} linha(s).`)
        }
      }
    }

    if (!APLICAR) {
      console.log('\nNada foi gravado. Rode com --aplicar.')
    } else {
      console.log('\nOK — estrutura fiscal criada.')
      console.log('Proximo passo: cadastrar os perfis tributarios com o contador.')
    }
  } finally {
    c.release()
    await pool.end()
  }
}

main().catch(err => { console.error('\nERRO:', err.message); process.exit(1) })
