// @ts-nocheck
import type { NextRequest } from 'next/server'
import { sql } from 'drizzle-orm'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { ok, serverError } from '@/lib/api/responses'

type Params = { params: { tenant: string } }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const notifs: any[] = []

      const [insumos, produtos, pedidos] = await Promise.all([
        db.execute(sql`
          SELECT nome, estoque_atual, estoque_minimo FROM t_insumo
          WHERE active_flg = true AND estoque_atual <= estoque_minimo
          ORDER BY (estoque_atual::float / NULLIF(estoque_minimo,0)) ASC LIMIT 8
        `),
        db.execute(sql`
          SELECT nome, estoque_atual, estoque_minimo FROM t_produto
          WHERE active_flg = true AND estoque_atual <= estoque_minimo
          ORDER BY estoque_atual ASC LIMIT 5
        `),
        db.execute(sql`
          SELECT pedido_id, identificacao FROM t_pedido
          WHERE active_flg = true AND status = 'pendente'
            AND created_dt < NOW() - INTERVAL '3 days'
          LIMIT 5
        `).catch(() => ({ rows: [] })),
      ])

      for (const r of insumos.rows as any[]) {
        notifs.push({
          id: `ins_${r.nome}`, tipo: 'estoque_critico', nivel: 'warning',
          titulo: `Insumo crítico`,
          descricao: `${r.nome}: ${r.estoque_atual} disponível (mín. ${r.estoque_minimo})`,
          href: 'estoque',
        })
      }
      for (const r of produtos.rows as any[]) {
        notifs.push({
          id: `prod_${r.nome}`, tipo: 'produto_critico', nivel: 'info',
          titulo: `Produto com estoque baixo`,
          descricao: `${r.nome}: ${r.estoque_atual} disponível (mín. ${r.estoque_minimo})`,
          href: 'estoque',
        })
      }
      for (const r of pedidos.rows as any[]) {
        notifs.push({
          id: `ped_${r.pedido_id}`, tipo: 'pedido_atrasado', nivel: 'warning',
          titulo: `Pedido pendente há mais de 3 dias`,
          descricao: r.identificacao || `Pedido #${r.pedido_id}`,
          href: 'pedidos',
        })
      }

      return ok(notifs)
    } finally { release() }
  } catch (err) { return serverError(err) }
}