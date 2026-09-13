// app/api/[tenant]/crm/resumo/route.ts
//
// KPIs da aba "Visão Geral" do CRM. Só leitura, sem escrita — agrega o que
// já existe em t_venda, t_cliente, t_crm_lead e t_cardapio_evento.
import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { exigirModulo } from '@/lib/auth/permissoes'
import { pool } from '@/lib/db/connection'
import { ok, serverError } from '@/lib/api/responses'

type Params = { params: { tenant: string } }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    await exigirModulo(tenant.schemaName, 'crm')
    const client = await pool.connect()
    try {
      await client.query(`SET search_path TO "${tenant.schemaName}", public`)

      const [clientes, ticket, leads, cardapioHoje] = await Promise.all([
        // Clientes com pelo menos 1 venda nos últimos 90 dias = "ativos".
        client.query(`
          SELECT COUNT(DISTINCT cliente_id)::int AS ativos
          FROM t_venda
          WHERE active_flg = true AND cliente_id IS NOT NULL
            AND vendida_em >= NOW() - INTERVAL '90 days'
        `),
        client.query(`
          SELECT COALESCE(AVG(total), 0)::bigint AS ticket_medio
          FROM t_venda
          WHERE active_flg = true AND vendida_em >= NOW() - INTERVAL '30 days'
        `),
        client.query(`
          SELECT estagio, COUNT(*)::int AS qtd, COALESCE(SUM(valor_estimado_centavos), 0)::bigint AS valor
          FROM t_crm_lead
          WHERE active_flg = true AND estagio NOT IN ('ganho', 'perdido')
          GROUP BY estagio
        `),
        client.query(`
          SELECT
            COUNT(*) FILTER (WHERE tipo = 'visualizacao')::int   AS visualizacoes,
            COUNT(*) FILTER (WHERE tipo = 'pedido_montado')::int AS pedidos_montados
          FROM t_cardapio_evento
          WHERE active_flg = true
            AND DATE(ocorrido_em AT TIME ZONE 'America/Sao_Paulo') = DATE(NOW() AT TIME ZONE 'America/Sao_Paulo')
        `),
      ])

      return ok({
        clientesAtivos: clientes.rows[0]?.ativos ?? 0,
        ticketMedio:    Number(ticket.rows[0]?.ticket_medio ?? 0),
        leadsPorEstagio: leads.rows.map(r => ({
          estagio: r.estagio, qtd: r.qtd, valorEstimado: Number(r.valor),
        })),
        cardapioHoje: {
          visualizacoes:   cardapioHoje.rows[0]?.visualizacoes ?? 0,
          pedidosMontados: cardapioHoje.rows[0]?.pedidos_montados ?? 0,
        },
      })
    } finally {
      client.release()
    }
  } catch (err) {
    return serverError(err)
  }
}
