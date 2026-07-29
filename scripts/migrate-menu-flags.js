// scripts/migrate-menu-flags.js
//
// Objetivo: todo item do menu lateral passa a ter uma chave em Configurações.
//
// O que faz, em todos os schemas de tenant:
//   1. cria vendas_ativo, financeiro_ativo, compras_ativo e fidelidade_ativo
//      em t_configuracoes_tenant (default true — nada some de quem já usa);
//   2. corrige a divergência de nome: se existir a coluna antiga
//      modulo_compras_ativo, copia o valor dela para compras_ativo.
//      O tenant-layout lia modulo_compras_ativo enquanto a API gravava em
//      compras_ativo, então a chave de Compras nunca surtia efeito.
//
// É idempotente: pode rodar quantas vezes quiser.
//
//   node scripts/migrate-menu-flags.js            → mostra o que faria
//   node scripts/migrate-menu-flags.js --apply    → aplica
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

const APLICAR = process.argv.includes('--apply')

const COLUNAS = [
  ['vendas_ativo',     'BOOLEAN NOT NULL DEFAULT true'],
  ['financeiro_ativo', 'BOOLEAN NOT NULL DEFAULT true'],
  ['compras_ativo',    'BOOLEAN NOT NULL DEFAULT true'],
  ['fidelidade_ativo', 'BOOLEAN NOT NULL DEFAULT true'],
]

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const client = await pool.connect()

  try {
    const { rows: schemas } = await client.query(`
      SELECT schema_name FROM information_schema.schemata
      WHERE schema_name LIKE 'tenant\\_%' ESCAPE '\\'
      ORDER BY schema_name
    `)

    if (schemas.length === 0) {
      console.log('Nenhum schema de tenant encontrado.')
      return
    }

    console.log(`${schemas.length} tenant(s)${APLICAR ? '' : ' — SIMULAÇÃO, nada será gravado'}\n`)

    for (const { schema_name: schema } of schemas) {
      console.log(`── ${schema}`)

      const { rows: existentes } = await client.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = 't_configuracoes_tenant'`,
        [schema]
      )
      const nomes = new Set(existentes.map(r => r.column_name))

      if (nomes.size === 0) {
        console.log('   t_configuracoes_tenant não existe — pulando')
        continue
      }

      for (const [col, tipo] of COLUNAS) {
        if (nomes.has(col)) {
          console.log(`   já existe: ${col}`)
          continue
        }
        console.log(`   criar:     ${col}`)
        if (APLICAR) {
          await client.query(
            `ALTER TABLE "${schema}".t_configuracoes_tenant ADD COLUMN ${col} ${tipo}`
          )
        }
      }

      // Herda o valor da coluna antiga, se ela existir
      if (nomes.has('modulo_compras_ativo')) {
        console.log('   migrar:    modulo_compras_ativo → compras_ativo')
        if (APLICAR) {
          await client.query(`
            UPDATE "${schema}".t_configuracoes_tenant
            SET compras_ativo = COALESCE(modulo_compras_ativo, true)
          `)
        }
      }
    }

    console.log(APLICAR ? '\nConcluído.' : '\nSimulação concluída. Rode com --apply para gravar.')
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch(err => { console.error(err); process.exit(1) })