// @ts-nocheck
// ESTE ARQUIVO VAI EM: app/api/[tenant]/vendas/[id]/route.ts
import type { NextRequest } from 'next/server'
import { sql } from 'drizzle-orm'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { VendaService } from '@/lib/services/vendas/VendaService'
import { CashbackService } from '@/lib/services/fidelidade/CashbackService'
import { ok, serverError, notFound } from '@/lib/api/responses'

type Params = { params: { tenant: string; id: string } }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const service = new VendaService(db)
      const result  = await service.findById(Number(params.id))
      if (!result) return notFound('Venda não encontrada')
      return ok(result)
    } finally {
      release()
    }
  } catch (err) {
    return serverError(err)
  }
}

// DELETE — soft delete da venda (some da listagem) e estorno do cashback
// gerado/usado por ela (remove crédito e devolve saldo usado). Não reverte
// estoque (comportamento herdado; ajuste manual pelo módulo Estoque se preciso).
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const id = Number(params.id)

      const existe = await db.execute(sql`SELECT venda_id FROM t_venda WHERE venda_id = ${id} AND active_flg = true`)
      if (existe.rows.length === 0) return notFound('Venda não encontrada')

      // Estorna cashback ANTES de inativar (ainda encontra os movimentos por venda_id)
      try {
        await new CashbackService(db).estornarVenda(id, 1)
      } catch (_) {
        // fidelidade não configurada — ignora
      }

      await db.execute(sql`
        UPDATE t_venda SET active_flg = false, updated_dt = NOW() WHERE venda_id = ${id}
      `)

      return ok({ deletado: true, estornoCashback: true })
    } finally {
      release()
    }
  } catch (err) {
    return serverError(err)
  }
}