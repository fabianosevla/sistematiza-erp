// @ts-nocheck
// ESTE ARQUIVO VAI EM: app/api/[tenant]/fidelidade/saldo/route.ts
//
// Saldo de cashback de um cliente + parâmetros de uso, para o PDV/Vendas
// mostrarem "R$ X disponível" e habilitarem o resgate.
import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { CashbackService } from '@/lib/services/fidelidade/CashbackService'
import { ok, serverError, badRequest } from '@/lib/api/responses'

type Params = { params: { tenant: string } }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { searchParams } = new URL(req.url)
    const clienteId = Number(searchParams.get('clienteId'))
    if (!clienteId) return badRequest('clienteId é obrigatório')

    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const cash = new CashbackService(db)
      const cfg  = await cash.getConfig()
      const saldo = await cash.getSaldo(clienteId)
      return ok({
        clienteId,
        saldoCentavos:          saldo,
        programaAtivo:          cfg?.programaAtivo ?? false,
        limiteUsoPctBp:         cfg?.limiteUsoPctBp ?? 10000,
        saldoMinimoUsoCentavos: cfg?.saldoMinimoUsoCentavos ?? 0,
      })
    } finally {
      release()
    }
  } catch (err) { return serverError(err) }
}