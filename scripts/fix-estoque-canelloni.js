// scripts/fix-estoque-canelloni.js
//
// CORREÇÃO DO ESTOQUE INFLADO DO CANELLONI 4 QUEIJOS.
//
// Origem do erro: a rota de Pedidos somava estoque ao marcar "Pronto", e a
// grade de Produção somava de novo ao registrar a produção do mesmo dia. O
// produto entrou duas vezes. O check-pedidos-estoque.js confirmou: apenas um
// produto ficou inflado, em 10 unidades.
//
// Este script NÃO faz UPDATE direto no saldo. Ele grava a movimentação de
// SAÍDA correspondente à diferença e ajusta o saldo na mesma transação — o
// mesmo caminho que a tela de Ajustar passou a usar. Corrigir por UPDATE cru
// deixaria o estoque certo e o extrato mentindo, que é como o problema
// original nasceu.
//
//   node scripts/fix-estoque-canelloni.js            (simula)
//   node scripts/fix-estoque-canelloni.js --aplicar  (grava)
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

const APLICAR = process.argv.includes('--aplicar')
const SCHEMA  = 'tenant_zaghi_massas_caseiras'

// Alvo declarado no código, não digitado na hora: script de produção que
// aceita nome por argumento é script que uma hora corrige o produto errado.
const ALVO = {
  nomeContem: 'Canelloni 4 Queijos',
  saldoCorreto: 44,
  motivo: 'Correção: dupla contagem entre Pedido "Pronto" e Registro de Produção',
}

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
    await c.query(`SET search_path TO "${SCHEMA}", public`)
    console.log(APLICAR ? '\n>>> MODO GRAVACAO\n' : '\n>>> SIMULACAO — nada sera gravado. Use --aplicar.\n')

    const { rows } = await c.query(
      `SELECT produto_id, nome, estoque_atual, unidade
         FROM t_produto
        WHERE active_flg = true AND nome ILIKE $1`,
      [`%${ALVO.nomeContem}%`],
    )

    if (rows.length === 0) { console.log(`Produto "${ALVO.nomeContem}" nao encontrado.`); return }
    if (rows.length > 1) {
      console.log('Mais de um produto casou com o nome — abortando por seguranca:')
      for (const r of rows) console.log(`   ${r.produto_id} · ${r.nome}`)
      return
    }

    const p     = rows[0]
    const atual = Number(p.estoque_atual ?? 0)
    const delta = ALVO.saldoCorreto - atual

    console.log(`Produto:        ${p.nome} (id ${p.produto_id})`)
    console.log(`Estoque atual:  ${atual} ${p.unidade ?? ''}`)
    console.log(`Estoque correto:${ALVO.saldoCorreto} ${p.unidade ?? ''}`)
    console.log(`Diferenca:      ${delta > 0 ? '+' : ''}${delta}`)

    if (delta === 0) { console.log('\nJa esta correto. Nada a fazer.'); return }
    if (!APLICAR)     { console.log('\nSimulacao encerrada. Rode com --aplicar.'); return }

    await c.query('BEGIN')
    try {
      await c.query(
        `UPDATE t_produto SET estoque_atual = $1, updated_dt = NOW() WHERE produto_id = $2`,
        [ALVO.saldoCorreto, p.produto_id],
      )
      await c.query(`
        INSERT INTO t_movimentacao_estoque
          (tipo, entidade, entidade_id, quantidade, preco_custo, observacao,
           data_movimentacao, created_by, updated_by, created_dt, updated_dt, active_flg, modification_num)
        VALUES ($1, 'produto', $2, $3, 0, $4, NOW(), 1, 1, NOW(), NOW(), true, 0)
      `, [
        delta > 0 ? 'entrada' : 'saida',
        p.produto_id,
        Math.abs(delta),
        `${ALVO.motivo} (${atual} → ${ALVO.saldoCorreto})`,
      ])
      await c.query('COMMIT')
      console.log('\nOK — saldo corrigido e movimentacao registrada no extrato.')
    } catch (e) {
      await c.query('ROLLBACK')
      throw e
    }
  } finally {
    c.release()
    await pool.end()
  }
}

main().catch(err => { console.error('\nERRO:', err.message); process.exit(1) })
