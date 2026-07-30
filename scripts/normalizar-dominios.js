// scripts/normalizar-dominios.js
//
// Padroniza valores de domínio que ficaram gravados de dois jeitos.
//
// PROBLEMA
// Registros importados guardaram o código ('MP'), e os cadastrados pela tela
// guardam o valor por extenso vindo de Cadastros → Domínios ('Matéria Prima').
// O resultado é a mesma coisa aparecendo com dois nomes na listagem, e filtro
// por tipo que não encontra metade dos registros.
//
// COMO USA
//   node scripts/normalizar-dominios.js            → só diagnostica
//   node scripts/normalizar-dominios.js --apply    → aplica o mapa abaixo
//
// O mapa é conservador: só troca o que está listado aqui. Se aparecer um valor
// que você quer padronizar e não está no mapa, acrescente a linha e rode de
// novo. A comparação ignora maiúsculas, acentos e espaços nas pontas.
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

const APLICAR = process.argv.includes('--apply')

// ── Mapa de normalização ────────────────────────────────────────────────────
// Formato:  tabela.coluna → { 'valor errado': 'valor correto' }
// A chave é comparada sem acento e sem diferenciar maiúsculas.
const MAPA = {
  't_insumo.tipo': {
    'mp':               'Matéria Prima',
    'materia prima':    'Matéria Prima',
    'materia-prima':    'Matéria Prima',
    'emb':              'Embalagem',
    'embalagem':        'Embalagem',
    'ins':              'Insumo',
    'insumo':           'Insumo',
  },
  't_produto.tipo': {
    'revenda':          null,   // null = deixa em branco (ver migrate-tipo-revenda.js)
  },
}

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

const normalizar = (s) => String(s ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .trim().toLowerCase()

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
      console.log(`═══ ${schema}\n`)

      // ── Valores em uso, por tabela/coluna do mapa ─────────────────────────
      for (const [alvo, regras] of Object.entries(MAPA)) {
        const [tabela, coluna] = alvo.split('.')

        const { rows: existe } = await client.query(
          `SELECT 1 FROM information_schema.columns
           WHERE table_schema = $1 AND table_name = $2 AND column_name = $3`,
          [schema, tabela, coluna]
        )
        if (existe.length === 0) continue

        const { rows: valores } = await client.query(`
          SELECT COALESCE(${coluna}, '(vazio)') AS valor, COUNT(*)::int AS registros
          FROM "${schema}"."${tabela}"
          WHERE active_flg = true
          GROUP BY ${coluna}
          ORDER BY registros DESC
        `)

        console.log(`── ${tabela}.${coluna}`)
        const linhas = valores.map(v => {
          const chave  = normalizar(v.valor)
          const temRegra = Object.prototype.hasOwnProperty.call(regras, chave)
          const destino  = temRegra ? regras[chave] : undefined
          let acao = 'manter'
          if (temRegra) {
            if (destino === null) acao = '→ (vazio)'
            else if (normalizar(destino) !== chave || destino !== v.valor) acao = `→ ${destino}`
          }
          return { valor: v.valor, registros: v.registros, acao }
        })
        console.table(linhas)

        // ── Aplicação ────────────────────────────────────────────────────────
        if (!APLICAR) continue

        for (const [errado, correto] of Object.entries(regras)) {
          const res = await client.query(`
            UPDATE "${schema}"."${tabela}"
            SET ${coluna} = $1, updated_dt = NOW()
            WHERE LOWER(TRIM(TRANSLATE(COALESCE(${coluna}, ''),
                  'áàãâäéèêëíìîïóòõôöúùûüçÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇ',
                  'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'))) = $2
              AND COALESCE(${coluna}, '') IS DISTINCT FROM COALESCE($1, '')
          `, [correto, errado])
          if (res.rowCount > 0) {
            console.log(`   ${res.rowCount} registro(s): "${errado}" → ${correto === null ? '(vazio)' : `"${correto}"`}`)
          }
        }
        console.log('')
      }

      // ── O que existe em Domínios, para conferência ────────────────────────
      const { rows: temDominio } = await client.query(
        `SELECT 1 FROM information_schema.tables
         WHERE table_schema = $1 AND table_name = 't_dominio_valor'`,
        [schema]
      )
      if (temDominio.length > 0) {
        const { rows: dom } = await client.query(`
          SELECT d.codigo, v.valor
          FROM "${schema}".t_dominio_valor v
          JOIN "${schema}".t_dominio d ON d.dominio_id = v.dominio_id
          WHERE v.active_flg = true AND d.active_flg = true
            AND d.codigo IN ('tipo_insumo', 'tipo_produto')
          ORDER BY d.codigo, v.valor
        `).catch(() => ({ rows: [] }))
        if (dom.length > 0) {
          console.log('── Valores cadastrados em Domínios (referência)')
          console.table(dom)
        }
      }
    }

    console.log(APLICAR
      ? '\nConcluído. Confira a listagem de Insumos.'
      : '\nSimulação concluída. Confira a coluna "acao" e rode com --apply.')
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch(err => { console.error(err); process.exit(1) })