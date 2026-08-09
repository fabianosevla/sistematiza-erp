// @ts-nocheck
// ESTE ARQUIVO VAI EM: app/api/[tenant]/producao/grade/route.ts
import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { pool } from '@/lib/db/connection'
import { ok, serverError } from '@/lib/api/responses'

type Params = { params: { tenant: string } }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { searchParams } = new URL(req.url)
    // Aceita tanto inicio/fim quanto dataInicio/dataFim para compatibilidade
    const inicio = searchParams.get('inicio') ?? searchParams.get('dataInicio') ?? new Date().toISOString().slice(0, 10)
    const fim    = searchParams.get('fim')    ?? searchParams.get('dataFim')    ?? new Date().toISOString().slice(0, 10)

    const client = await pool.connect()
    try {
      await client.query(`SET search_path TO "${tenant.schemaName}", public`)

      // Produtos ativos — EXCLUI produtos de revenda: eles não são produzidos
      // (são comprados prontos), então não fazem sentido na grade de Produção.
      // COALESCE cobre bancos onde a migration ainda não rodou; o fallback
      // tipo='Revenda' cobre dados anteriores à coluna própria.
      const produtosRes = await client.query(`
        SELECT produto_id, nome, estoque_atual, estoque_minimo, unidade
        FROM t_produto
        WHERE active_flg = true
          AND COALESCE(revenda, false) = false
          AND COALESCE(tipo, '') <> 'Revenda'
        ORDER BY nome
      `)

      // Grade de produção da semana
      const gradeRes = await client.query(`
        SELECT produto_id, data_producao::text, quantidade
        FROM t_producao_grade
        WHERE active_flg = true
          AND data_producao >= $1::date
          AND data_producao <= $2::date
      `, [inicio, fim])

      // Monta grade[produtoId][data] = quantidade
      const grade: Record<number, Record<string, number>> = {}
      for (const p of produtosRes.rows) grade[p.produto_id] = {}
      for (const g of gradeRes.rows) {
        const data = g.data_producao.slice(0, 10)
        if (!grade[g.produto_id]) grade[g.produto_id] = {}
        grade[g.produto_id][data] = Number(g.quantidade)
      }

      const produtos = produtosRes.rows.map(p => ({
        produtoId:     p.produto_id,
        nome:          p.nome,
        estoqueAtual:  Number(p.estoque_atual ?? 0),
        estoqueMinimo: Number(p.estoque_minimo ?? 0),
        unidade:       p.unidade,
      }))

      // Pedidos da semana (por produto e data de previsão de produção)
      //
      // 'pronto' ENTRA AQUI.
      //
      // A versão anterior contava só 'pendente' e 'producao', partindo de que
      // pronto já tinha sido produzido e registrado na coluna PP. Na prática a
      // fábrica marca pronto pelo andamento do pedido, sem que isso dependa do
      // registro na grade — e o pedido sumia da demanda antes de a mercadoria
      // existir. Some da grade, some da previsão de insumo, e ninguém produz.
      //
      // O risco de produzir duas vezes continua coberto: o dia com produção
      // registrada aparece travado em cinza na própria linha.
      //
      // pi.active_flg É OBRIGATÓRIO AQUI.
      //
      // Editar um pedido não altera as linhas de item: inativa as antigas e
      // grava as novas. Sem este filtro, a coluna Ped somava a quantidade
      // velha junto com a nova, e todo pedido corrigido aparecia inflado —
      // fazendo a fábrica planejar produção para demanda que não existe.
      const pedidosRes = await client.query(`
        SELECT pi.produto_id,
               COALESCE(p.previsao_producao, p.data_pedido)::date as data_ref,
               SUM(pi.quantidade) as qtd
        FROM t_pedido_item pi
        JOIN t_pedido p ON pi.pedido_id = p.pedido_id
        WHERE p.active_flg = true
          AND pi.active_flg = true
          AND p.status IN ('pendente', 'producao', 'pronto')
          AND COALESCE(p.previsao_producao, p.data_pedido)::date BETWEEN $1::date AND $2::date
        GROUP BY pi.produto_id, COALESCE(p.previsao_producao, p.data_pedido)::date
      `, [inicio, fim]).catch(() => ({ rows: [] }))

      const pedidos: Record<number, Record<string, number>> = {}
      for (const row of pedidosRes.rows) {
        const data = row.data_ref instanceof Date ? row.data_ref.toISOString().slice(0, 10) : String(row.data_ref).slice(0, 10)
        if (!pedidos[row.produto_id]) pedidos[row.produto_id] = {}
        pedidos[row.produto_id][data] = Number(row.qtd)
      }

      // TUDO QUE JÁ TEM DONO E NÃO SAIU — para a Prev. Est.
      //
      // A coluna Ped mostra a demanda da SEMANA visível. A Prev. Est. compara
      // com estoque_atual, que é de agora e não tem semana: pedido de duas
      // semanas atrás que nunca foi entregue continua ocupando prateleira.
      //
      // Por isso este total não tem recorte de data. Se usasse a soma da
      // semana, a previsão ofereceria para venda mercadoria já separada.
      const comprometidoRes = await client.query(`
        SELECT pi.produto_id, SUM(pi.quantidade) AS qtd
        FROM t_pedido_item pi
        JOIN t_pedido p ON pi.pedido_id = p.pedido_id
        WHERE p.active_flg = true
          AND pi.active_flg = true
          AND p.status IN ('pendente', 'producao', 'pronto')
        GROUP BY pi.produto_id
      `).catch(() => ({ rows: [] }))

      const comprometido: Record<number, number> = {}
      for (const row of comprometidoRes.rows) comprometido[row.produto_id] = Number(row.qtd)

      return ok({ produtos, grade, pedidos, comprometido, inicio, fim })
    } finally {
      client.release()
    }
  } catch (err) {
    return serverError(err)
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const body   = await req.json()
    const { produtoId, dataProducao, quantidade } = body

    if (!produtoId || !dataProducao) {
      return serverError(new Error('produtoId e dataProducao são obrigatórios'))
    }

    const client = await pool.connect()
    try {
      await client.query(`SET search_path TO "${tenant.schemaName}", public`)

      if (quantidade === 0) {
        // Remove a célula se quantidade for zero
        await client.query(`
          UPDATE t_producao_grade
          SET active_flg = false, updated_dt = NOW()
          WHERE produto_id = $1 AND data_producao = $2::date AND active_flg = true
        `, [produtoId, dataProducao])
      } else {
        // Upsert da célula
        await client.query(`
          INSERT INTO t_producao_grade (produto_id, data_producao, quantidade, created_by, updated_by, created_dt, updated_dt, active_flg, modification_num)
          VALUES ($1, $2::date, $3, 1, 1, NOW(), NOW(), true, 0)
          ON CONFLICT (produto_id, data_producao)
          DO UPDATE SET quantidade = $3, updated_dt = NOW(), active_flg = true
        `, [produtoId, dataProducao, quantidade])
      }

      return ok({ ok: true, produtoId, dataProducao, quantidade })
    } finally {
      client.release()
    }
  } catch (err) {
    return serverError(err)
  }
}