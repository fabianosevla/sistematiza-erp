// @ts-nocheck
// ESTE ARQUIVO VAI EM: app/api/[tenant]/dashboard/pedidos-status/route.ts
//
// Distribuição de pedidos por status, com recorte de período — mesmo motivo
// das outras rotas própias do dashboard: trocar o período não pode recarregar
// o resto da tela.
//
//   GET ?periodo=dia | semana | mes   (padrão: semana)
//
// O recorte é por data_pedido (quando o pedido foi criado), não por status —
// um pedido pendente de ontem continua contando em "hoje" seria errado; o
// que se pergunta aqui é "dos pedidos FEITOS nesse período, como estão
// distribuídos".
import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { pool } from '@/lib/db/connection'
import { ok, serverError } from '@/lib/api/responses'

type Params = { params: { tenant: string } }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const client = await pool.connect()
    try {
      await client.query(`SET search_path TO "${tenant.schemaName}", public`)

      const { searchParams } = new URL(req.url)
      const periodo = searchParams.get('periodo') ?? 'semana'
      const truncPor = periodo === 'dia' ? 'day' : periodo === 'mes' ? 'month' : 'week'

      const r = await client.query(`
        SELECT status, COUNT(*)::int AS qtd
        FROM t_pedido
        WHERE active_flg = true
          AND status IN ('pendente','producao','pronto','entregue')
          AND (data_pedido AT TIME ZONE 'America/Sao_Paulo')
              >= DATE_TRUNC('${truncPor}', NOW() AT TIME ZONE 'America/Sao_Paulo')
        GROUP BY status
      `)

      const porStatus: Record<string, number> = { pendente: 0, producao: 0, pronto: 0, entregue: 0 }
      for (const row of r.rows) porStatus[row.status] = Number(row.qtd)

      return ok({ periodo, porStatus })
    } finally {
      client.release()
    }
  } catch (err) {
    return serverError(err)
  }
}
