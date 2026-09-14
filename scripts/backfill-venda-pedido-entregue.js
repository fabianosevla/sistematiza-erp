/**
 * Backfill: venda pra pedido que já estava "Entregue" (13/09/2026)
 *
 * A venda de um pedido passou a nascer NA ENTREGA, não mais só na baixa da
 * conta a receber (ver app/api/[tenant]/pedidos/[id]/route.ts). Isso vale
 * pra toda entrega DAQUI PRA FRENTE — mas pedido que já estava "Entregue"
 * antes dessa mudança ficou sem venda até a conta dele ser baixada (ou,
 * se nunca foi baixada, continua sem venda até hoje). Este script fecha
 * essa lacuna retroativamente: todo pedido com status = 'entregue' e
 * venda_id NULO ganha a venda agora, com os mesmos itens e valor do pedido.
 *
 * NÃO mexe em estoque (já saiu na entrega — isso aqui é só reconhecimento
 * de receita) nem na conta a receber. Se a conta do pedido já estiver
 * "recebida", a forma de pagamento que já foi registrada nela é copiada
 * pra t_venda_pagamento — a venda retroativa nasce com o pagamento certo
 * quando ele já é conhecido, em vez de sempre ficar "sem forma".
 *
 * DATA DA VENDA: usa `updated_dt` do pedido, não a data de hoje. Pedido
 * entregue não pode mais ser editado (ver STATUS_EDITAVEIS), então esse
 * campo já reflete o momento em que a entrega aconteceu — usar NOW() faria
 * dezenas de pedidos de meses atrás aparecerem como "venda de hoje" no
 * dashboard, o que seria pior que a lacuna que este script corrige.
 *
 * Idempotente: só entra quem ainda tem venda_id NULO. Pode rodar de novo.
 *
 * Rodar sem --apply primeiro (só mostra o que faria); com --apply grava.
 *   node scripts/backfill-venda-pedido-entregue.js
 *   node scripts/backfill-venda-pedido-entregue.js --apply
 */
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

const APLICAR = process.argv.includes('--apply')

const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     5432,
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl:      { rejectUnauthorized: false },
})

async function backfillSchema(client, schema) {
  await client.query(`SET search_path TO "${schema}", public`)

  const pedidosRes = await client.query(`
    SELECT pedido_id, cliente_id, nome_cliente_avulso, tipo_venda, origem,
           endereco_entrega, observacao, valor_entrega, updated_dt
      FROM t_pedido
     WHERE active_flg = true AND status = 'entregue' AND venda_id IS NULL
     ORDER BY pedido_id
  `)

  if (pedidosRes.rows.length === 0) {
    console.log(`  ${schema}: nada a fazer (todo pedido entregue já tem venda).`)
    return { processados: 0, ignorados: 0 }
  }

  let processados = 0
  let ignorados   = 0

  for (const pedido of pedidosRes.rows) {
    const itensRes = await client.query(`
      SELECT produto_id, nome_produto, quantidade, preco_unitario, subtotal
        FROM t_pedido_item
       WHERE pedido_id = $1 AND active_flg = true
    `, [pedido.pedido_id])
    const itens = itensRes.rows

    if (itens.length === 0) {
      console.log(`  ${schema}: pedido #${pedido.pedido_id} sem itens ativos — ignorado.`)
      ignorados++
      continue
    }

    const subtotal = itens.reduce((a, i) => a + Number(i.subtotal ?? 0), 0)
    const total    = subtotal + Number(pedido.valor_entrega ?? 0)

    // Forma de pagamento, SE a conta a receber deste pedido já estiver
    // quitada — best effort: pega a primeira parcela recebida com forma
    // registrada. Sem isso, a venda nasce sem pagamento (igual nasceria
    // numa entrega feita hoje, antes de a conta ser baixada).
    const contaRes = await client.query(`
      SELECT forma_recebimento, valor_recebido
        FROM t_conta_receber
       WHERE origem = 'pedido' AND origem_id = $1 AND active_flg = true
         AND status = 'recebida' AND forma_recebimento IS NOT NULL
       ORDER BY conta_receber_id
       LIMIT 1
    `, [pedido.pedido_id])
    const forma = contaRes.rows[0]?.forma_recebimento ?? null

    console.log(
      `  ${schema}: pedido #${pedido.pedido_id} → venda de ${(total / 100).toFixed(2)} `
      + `(${itens.length} item(ns), entregue em ${new Date(pedido.updated_dt).toLocaleDateString('pt-BR')}`
      + `${forma ? `, pago em ${forma}` : ', sem pagamento conhecido'})`
    )

    if (!APLICAR) { processados++; continue }

    const vendaRes = await client.query(`
      INSERT INTO t_venda (
        origem, origem_cardapio, cliente_id, nome_cliente_avulso, status, tipo_entrega,
        data_entrega, endereco_entrega, subtotal, desconto, total,
        observacao, vendida_em,
        created_by, updated_by, created_dt, updated_dt, active_flg, modification_num
      ) VALUES (
        'pedido', $1, $2, $3, 'concluida', $4,
        $5, $6, $7, $8, $9,
        $10, $5,
        1, 1, NOW(), NOW(), true, 0
      ) RETURNING venda_id
    `, [
      pedido.origem === 'cardapio',
      pedido.cliente_id,
      pedido.nome_cliente_avulso,
      pedido.tipo_venda === 'balcao' ? 'Retirada' : 'Entrega',
      pedido.updated_dt,
      pedido.endereco_entrega,
      subtotal,
      subtotal - total,
      total,
      `Pedido #${pedido.pedido_id}${pedido.observacao ? ' — ' + pedido.observacao : ''} (venda gerada retroativamente em ${new Date().toLocaleDateString('pt-BR')})`,
    ])
    const vendaId = vendaRes.rows[0].venda_id

    for (const it of itens) {
      await client.query(`
        INSERT INTO t_venda_item (
          venda_id, produto_id, nome_produto, quantidade, preco_unitario, desconto, subtotal,
          created_by, updated_by, created_dt, updated_dt, active_flg, modification_num
        ) VALUES ($1, $2, $3, $4, $5, 0, $6, 1, 1, NOW(), NOW(), true, 0)
      `, [vendaId, it.produto_id, it.nome_produto, it.quantidade, it.preco_unitario, it.subtotal])
    }

    if (forma) {
      await client.query(`
        INSERT INTO t_venda_pagamento (
          venda_id, forma, valor,
          created_by, updated_by, created_dt, updated_dt, active_flg, modification_num
        ) VALUES ($1, $2, $3, 1, 1, NOW(), NOW(), true, 0)
      `, [vendaId, forma, total])
    }

    // updated_dt de propósito NÃO muda aqui: ele é o proxy que usamos acima
    // pra saber quando o pedido foi entregue, e gravar venda_id não pode
    // apagar esse rastro.
    await client.query(
      `UPDATE t_pedido SET venda_id = $1 WHERE pedido_id = $2`,
      [vendaId, pedido.pedido_id]
    )

    processados++
  }

  return { processados, ignorados }
}

pool.connect().then(async client => {
  const res = await client.query(`
    SELECT schema_name FROM information_schema.schemata
    WHERE schema_name LIKE 'tenant_%'
    ORDER BY schema_name
  `)
  const schemas = res.rows.map(r => r.schema_name)
  console.log(`\nBackfill de venda em pedido entregue — ${APLICAR ? 'APLICANDO' : 'SIMULAÇÃO (use --apply pra gravar)'}\n`)

  let totalProcessados = 0
  let totalIgnorados   = 0
  for (const schema of schemas) {
    try {
      const r = await backfillSchema(client, schema)
      totalProcessados += r.processados
      totalIgnorados   += r.ignorados
    } catch (e) {
      console.error(`  ✗ ${schema}: ${e.message}`)
    }
  }

  console.log(`\n${APLICAR ? 'Concluído' : 'Simulação concluída'}: ${totalProcessados} venda(s)${APLICAR ? ' criada(s)' : ' seria(m) criada(s)'}, ${totalIgnorados} pedido(s) ignorado(s) (sem item ativo).\n`)
  client.release()
  pool.end()
}).catch(err => { console.error('Erro:', err.message); process.exit(1) })
