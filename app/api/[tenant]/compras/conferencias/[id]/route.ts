// app/api/[tenant]/compras/conferencias/[id]/route.ts
import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { ConferenciaService } from '@/lib/services/compras/ConferenciaService'
import { ok, serverError, notFound } from '@/lib/api/responses'

type P = { params: { tenant: string; id: string } }

export async function GET(req: NextRequest, { params }: P) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const result = await new ConferenciaService(db).findById(Number(params.id))
      if (!result) return notFound('Conferência não encontrada')
      return ok(result)
    } finally { release() }
  } catch (err) { return serverError(err) }
}

// PUT — lançar quantidade recebida de um item OU finalizar a conferência
// body: { acao: 'lancar-item', itemId, quantidadeRecebida }
// body: { acao: 'finalizar', gerarContaPagar?, vencimentoContaPagar? }
export async function PUT(req: NextRequest, { params }: P) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const body = await req.json()
      const svc  = new ConferenciaService(db)

      if (body.acao === 'lancar-item') {
        return ok(await svc.lancarItem(body.itemId, body.quantidadeRecebida, 1))
      }
      if (body.acao === 'finalizar') {
        return ok(await svc.finalizar(Number(params.id), {
          gerarContaPagar:      body.gerarContaPagar ?? true,
          vencimentoContaPagar: body.vencimentoContaPagar,
        }, 1))
      }
      return serverError(new Error('ação inválida'))
    } finally { release() }
  } catch (err) { return serverError(err) }
}