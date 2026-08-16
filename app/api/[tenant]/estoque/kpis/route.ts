// @ts-nocheck
// app/api/[tenant]/estoque/kpis/route.ts
//
// KPIs do Estoque contando TODOS os registros (não só a página atual).
// Retorna totais e "críticos" (estoque_atual <= estoque_minimo) de produtos e insumos.
import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { exigirModulo } from '@/lib/auth/permissoes'
import { pool } from '@/lib/db/connection'
import { ok, serverError } from '@/lib/api/responses'

type Params = { params: { tenant: string } }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    await exigirModulo(tenant.schemaName, 'estoque')
    const client = await pool.connect()
    try {
      await client.query(`SET search_path TO "${tenant.schemaName}", public`)
      const res = await client.query(`
        SELECT
          (SELECT COUNT(*)::int FROM t_produto WHERE active_flg = true)                                              AS produtos,
          (SELECT COUNT(*)::int FROM t_produto WHERE active_flg = true AND estoque_atual <= estoque_minimo)          AS produtos_criticos,
          (SELECT COUNT(*)::int FROM t_insumo  WHERE active_flg = true)                                              AS insumos,
          (SELECT COUNT(*)::int FROM t_insumo  WHERE active_flg = true AND estoque_atual <= estoque_minimo)          AS insumos_criticos
      `)
      const r = res.rows[0] ?? {}
      return ok({
        produtos:         Number(r.produtos ?? 0),
        produtosCriticos: Number(r.produtos_criticos ?? 0),
        insumos:          Number(r.insumos ?? 0),
        insumosCriticos:  Number(r.insumos_criticos ?? 0),
      })
    } finally {
      client.release()
    }
  } catch (err) { return serverError(err) }
}