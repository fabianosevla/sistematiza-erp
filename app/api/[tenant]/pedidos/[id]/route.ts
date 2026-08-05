// @ts-nocheck
// ESTE ARQUIVO VAI EM: app/api/[tenant]/pedidos/[id]/route.ts
//
// ─── FLUXO DO PEDIDO ─────────────────────────────────────────────────────────
//
// Pendente / Em Produção / Pronto → NÃO tocam no estoque.
//   O pedido é demanda: aparece na coluna Ped da grade de Produção e derruba a
//   Prev. Est. Quem faz o estoque entrar é o registro de produção na coluna PP,
//   e é lá que o insumo é debitado.
//
//   A versão anterior somava o estoque ao marcar "Pronto". Como a produção já
//   entrava pela grade, o produto era contado DUAS vezes.
//
// Entregue → é a venda.
//   Numa transação só: debita o produto acabado, cria a venda com origem
//   'pedido', grava o venda_id no pedido, registra a movimentação de estoque e
//   abre a conta a receber com vencimento na previsão de entrega.
//
//   O insumo NÃO é debitado aqui. Ele já saiu quando a produção foi
//   registrada — debitar de novo tiraria a mesma farinha duas vezes.
//
// Cancelado → não reverte nada, porque nada foi somado.
//   Cancelar pedido JÁ ENTREGUE é bloqueado: existe venda e conta a receber,
//   e desfazer isso em silêncio corromperia o financeiro.
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { pool } from '@/lib/db/connection'
import { PedidoService } from '@/lib/services/producao/PedidoService'
import { ok, serverError, notFound, badRequest } from '@/lib/api/responses'

type Params = { params: { tenant: string; id: string } }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const result = await new PedidoService(db).findById(Number(params.id))
      if (!result) return notFound('Pedido não encontrado')
      return ok(result)
    } finally { release() }
  } catch (err) { return serverError(err) }
}

// ── EDITAR PEDIDO ────────────────────────────────────────────────────────────
// PUT atualiza cliente, tipo, data do pedido, previsão de produção, previsão
// de entrega, endereço, observação e a lista de itens. Só permitido enquanto
// o pedido não foi entregue — depois da entrega existe venda emitida, e mudar
// os itens tornaria a venda mentirosa.
const atualizarPedidoSchema = z.object({
  clienteId:        z.number().int().optional(),
  tipoVenda:        z.enum(['balcao', 'entrega']).default('entrega'),
  dataPedido:       z.string(),
  previsaoProducao: z.string().optional(),
  previsaoEntrega:  z.string().optional(),
  valorEntrega:     z.number().int().default(0),
  enderecoEntrega:  z.string().max(300).optional(),
  observacao:       z.string().max(500).optional(),
  itens: z.array(z.object({
    produtoId:     z.number().int(),
    quantidade:    z.number().int().min(1),
    precoUnitario: z.number().int().default(0),
  })).min(1),
})

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const body    = await req.json()
      const payload = atualizarPedidoSchema.parse(body)
      const service = new PedidoService(db)

      const pedido = await service.findById(Number(params.id))
      if (!pedido) return notFound('Pedido não encontrado')
      if (['entregue', 'cancelado'].includes(pedido.status)) {
        return badRequest(`Pedido "${pedido.status}" não pode ser editado.`)
      }

      const result = await service.atualizar(Number(params.id), { ...payload, userId: 1 })
      return ok(result)
    } finally { release() }
  } catch (err) { return serverError(err) }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { status } = await req.json()
    if (!status) return badRequest('Status é obrigatório')

    const VALIDOS = ['pendente', 'producao', 'pronto', 'entregue', 'cancelado']
    if (!VALIDOS.includes(status)) return badRequest(`Status inválido: ${status}`)

    const pedidoId = Number(params.id)
    const client   = await pool.connect()
    try {
      await client.query(`SET search_path TO "${tenant.schemaName}", public`)

      // Cabeçalho do pedido + nome do cliente (para a conta a receber)
      const cab = await client.query(`
        SELECT p.pedido_id, p.status, p.cliente_id, p.venda_id,
               p.tipo_venda, p.endereco_entrega, p.observacao,
               p.previsao_entrega, p.valor_entrega,
               cl.nome_completo AS cliente_razao,
               cl.nome_fantasia AS cliente_fantasia
        FROM t_pedido p
        LEFT JOIN t_cliente cl ON cl.cliente_id = p.cliente_id
        WHERE p.pedido_id = $1 AND p.active_flg = true
      `, [pedidoId])

      if (cab.rows.length === 0) return notFound('Pedido não encontrado')
      const pedido       = cab.rows[0]
      const statusAntigo = pedido.status

      if (statusAntigo === status) {
        return ok({ ok: true, status, pedidoId, message: 'Status já era esse.' })
      }

      // Entregue é irreversível: tem venda e conta a receber atrás dele.
      if (statusAntigo === 'entregue' && status !== 'entregue') {
        return badRequest(
          'Pedido já entregue não pode mudar de status. Existe venda e conta a receber vinculadas — cancele a venda se precisar desfazer.'
        )
      }

      // Itens do pedido
      const itensRes = await client.query(`
        SELECT produto_id, nome_produto, quantidade, preco_unitario, subtotal
        FROM t_pedido_item
        WHERE pedido_id = $1 AND active_flg = true
      `, [pedidoId])
      const itens = itensRes.rows

      // ── Transições que NÃO mexem em nada ────────────────────────────────
      // pendente, producao, pronto e cancelado apenas trocam o status.
      if (status !== 'entregue') {
        await client.query(
          `UPDATE t_pedido SET status = $1, updated_dt = NOW() WHERE pedido_id = $2`,
          [status, pedidoId]
        )
        return ok({ ok: true, status, pedidoId })
      }

      // ── ENTREGA: estoque + venda + conta a receber ──────────────────────
      if (itens.length === 0) {
        return badRequest('Pedido sem itens não pode ser entregue.')
      }

      // Confere estoque ANTES de abrir a transação, para avisar em vez de
      // zerar em silêncio. Estoque insuficiente aqui quase sempre significa
      // que a produção não foi registrada na grade.
      const insuficientes: { nome: string; precisa: number; tem: number }[] = []
      for (const it of itens) {
        const est = await client.query(
          `SELECT nome, estoque_atual::numeric AS estoque FROM t_produto WHERE produto_id = $1`,
          [it.produto_id]
        )
        const tem = Number(est.rows[0]?.estoque ?? 0)
        if (tem < Number(it.quantidade)) {
          insuficientes.push({
            nome:    est.rows[0]?.nome ?? it.nome_produto,
            precisa: Number(it.quantidade),
            tem,
          })
        }
      }

      const subtotal = itens.reduce((a: number, i: any) => a + Number(i.subtotal ?? 0), 0)
      const total    = subtotal + Number(pedido.valor_entrega ?? 0)

      const nomeCliente = String(pedido.cliente_fantasia ?? '').trim()
        || String(pedido.cliente_razao ?? '').trim()
        || null

      // Vencimento = previsão de entrega. Sem previsão, vence hoje.
      // A data é editável depois em Financeiro → Contas a Receber.
      const venc = pedido.previsao_entrega
        ? new Date(pedido.previsao_entrega).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10)
      const hoje = new Date().toISOString().slice(0, 10)

      await client.query('BEGIN')
      try {
        // 1. Status
        await client.query(
          `UPDATE t_pedido SET status = 'entregue', updated_dt = NOW() WHERE pedido_id = $1`,
          [pedidoId]
        )

        // 2. Venda — origem 'pedido' separa do que veio do PDV nos relatórios
        const vendaRes = await client.query(`
          INSERT INTO t_venda (
            origem, cliente_id, status, tipo_entrega, data_entrega, endereco_entrega,
            subtotal, desconto, total, observacao, vendida_em,
            created_by, updated_by, created_dt, updated_dt, active_flg, modification_num
          ) VALUES (
            'pedido', $1, 'concluida', $2, NOW(), $3,
            $4, 0, $5, $6, NOW(),
            1, 1, NOW(), NOW(), true, 0
          )
          RETURNING venda_id
        `, [
          pedido.cliente_id,
          pedido.tipo_venda === 'balcao' ? 'Retirada' : 'Entrega',
          pedido.endereco_entrega,
          subtotal,
          total,
          `Pedido #${pedidoId}${pedido.observacao ? ' — ' + pedido.observacao : ''}`,
        ])
        const vendaId = vendaRes.rows[0].venda_id

        // 3. Itens da venda
        for (const it of itens) {
          await client.query(`
            INSERT INTO t_venda_item (
              venda_id, produto_id, nome_produto, quantidade, preco_unitario, desconto, subtotal,
              created_by, updated_by, created_dt, updated_dt, active_flg, modification_num
            ) VALUES ($1,$2,$3,$4,$5,0,$6,1,1,NOW(),NOW(),true,0)
          `, [vendaId, it.produto_id, it.nome_produto, it.quantidade, it.preco_unitario, it.subtotal])
        }

        // 4. Estoque do produto acabado sai. O insumo NÃO — ele saiu na produção.
        for (const it of itens) {
          await client.query(`
            UPDATE t_produto
            SET estoque_atual = GREATEST(0, estoque_atual - $1), updated_dt = NOW()
            WHERE produto_id = $2 AND active_flg = true
          `, [it.quantidade, it.produto_id])

          // Movimentação, para o extrato do produto mostrar de onde veio a saída
          await client.query(`
            INSERT INTO t_movimentacao_estoque
              (tipo, entidade, entidade_id, quantidade, preco_custo, observacao,
               data_movimentacao, created_by, updated_by, created_dt, updated_dt, active_flg, modification_num)
            VALUES ('saida', 'produto', $1, $2, 0, $3, NOW(), 1, 1, NOW(), NOW(), true, 0)
          `, [it.produto_id, it.quantidade, `Entrega do pedido #${pedidoId}`])
        }

        // 5. Vincula a venda ao pedido
        await client.query(
          `UPDATE t_pedido SET venda_id = $1, updated_dt = NOW() WHERE pedido_id = $2`,
          [vendaId, pedidoId]
        )

        // 6. Conta a receber. Não há forma de pagamento definida na entrega —
        //    ela é informada na baixa, e é lá que a taxa de cartão aparece.
        await client.query(`
          INSERT INTO t_conta_receber (
            descricao, cliente_id, nome_cliente, categoria, numero_documento,
            valor_original, valor_recebido, data_emissao, data_vencimento,
            status, observacao, origem, origem_id, parcela_atual, total_parcelas,
            created_by, updated_by, created_dt, updated_dt, active_flg, modification_num
          ) VALUES (
            $1, $2, $3, 'Venda', $4,
            $5, 0, $6, $7,
            'aberta', $8, 'pedido', $9, 1, 1,
            1, 1, NOW(), NOW(), true, 0
          )
        `, [
          `Pedido #${pedidoId}${nomeCliente ? ' — ' + nomeCliente : ''}`,
          pedido.cliente_id,
          nomeCliente,
          `PED-${pedidoId}`,
          total,
          hoje,
          venc,
          `Gerada automaticamente na entrega do pedido #${pedidoId}. Venda #${vendaId}.`,
          pedidoId,
        ])

        await client.query('COMMIT')

        const aviso = insuficientes.length > 0
          ? ` Atenção: ${insuficientes.map(i => `${i.nome} (precisava ${i.precisa}, tinha ${i.tem})`).join('; ')}. O estoque desses produtos ficou zerado — confira se a produção foi registrada na grade.`
          : ''

        return ok({
          ok: true,
          status: 'entregue',
          pedidoId,
          vendaId,
          total,
          vencimento: venc,
          insuficientes,
          message: `Entrega confirmada. Venda #${vendaId} gerada e conta a receber criada com vencimento em ${venc.split('-').reverse().join('/')}.${aviso}`,
        })
      } catch (err) {
        await client.query('ROLLBACK')
        throw err
      }
    } finally {
      client.release()
    }
  } catch (err) { return serverError(err) }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      await new PedidoService(db).excluir(Number(params.id), 1)
      return ok({ deleted: true })
    } finally { release() }
  } catch (err) { return serverError(err) }
}