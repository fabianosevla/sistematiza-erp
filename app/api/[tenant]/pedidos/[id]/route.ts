// @ts-nocheck
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
// de entrega, endereço, observação e a lista de itens (aumentar/diminuir/
// trocar produtos). Só permitido para status 'pendente' e 'producao' — a
// partir de 'pronto' o estoque já foi movimentado pelo PATCH de status, e
// editar itens depois disso dessincronizaria o estoque.
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
      if (!['pendente', 'producao'].includes(pedido.status)) {
        return badRequest(`Pedido com status "${pedido.status}" não pode ser editado — o estoque já foi movimentado ou o pedido foi encerrado.`)
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

      // Busca o pedido e seus itens
      const pedidoRes = await client.query(
        `SELECT p.pedido_id, p.status,
                json_agg(json_build_object(
                  'produtoId', i.produto_id,
                  'nomeProduto', i.nome_produto,
                  'quantidade', i.quantidade
                )) as itens
         FROM t_pedido p
         LEFT JOIN t_pedido_item i ON i.pedido_id = p.pedido_id
         WHERE p.pedido_id = $1 AND p.active_flg = true
         GROUP BY p.pedido_id, p.status`,
        [pedidoId]
      )

      if (pedidoRes.rows.length === 0) return notFound('Pedido não encontrado')
      const pedido   = pedidoRes.rows[0]
      const itens    = pedido.itens?.filter((i: any) => i.produtoId) ?? []
      const statusAntigo = pedido.status

      // Atualiza o status
      await client.query(
        `UPDATE t_pedido SET status = $1, updated_dt = NOW() WHERE pedido_id = $2`,
        [status, pedidoId]
      )

      // Impacto no estoque conforme transição de status
      if (status === 'pronto' && statusAntigo !== 'pronto') {
        // Produção concluída → aumenta estoque do produto acabado
        for (const item of itens) {
          await client.query(
            `UPDATE t_produto SET estoque_atual = estoque_atual + $1, updated_dt = NOW()
             WHERE produto_id = $2 AND active_flg = true`,
            [item.quantidade, item.produtoId]
          )
        }
      }

      if (status === 'entregue' && statusAntigo !== 'entregue') {
        // Entregue → debita estoque do produto
        for (const item of itens) {
          await client.query(
            `UPDATE t_produto SET
               estoque_atual = GREATEST(0, estoque_atual - $1),
               updated_dt = NOW()
             WHERE produto_id = $2 AND active_flg = true`,
            [item.quantidade, item.produtoId]
          )
        }
      }

      if (status === 'cancelado' && statusAntigo === 'pronto') {
        // Cancelou depois de marcar como pronto → reverte estoque
        for (const item of itens) {
          await client.query(
            `UPDATE t_produto SET
               estoque_atual = GREATEST(0, estoque_atual - $1),
               updated_dt = NOW()
             WHERE produto_id = $2 AND active_flg = true`,
            [item.quantidade, item.produtoId]
          )
        }
      }

      return ok({ ok: true, status, pedidoId })
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