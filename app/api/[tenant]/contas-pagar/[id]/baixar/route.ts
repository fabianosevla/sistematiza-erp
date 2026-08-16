// ════════════════════════════════════════════════════════
// app/api/[tenant]/contas-pagar/[id]/baixar/route.ts
// ════════════════════════════════════════════════════════
import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { exigirModulo } from '@/lib/auth/permissoes'
import { getDbForTenant } from '@/lib/db/connection'
import { usuarioAtualIdDb } from '@/lib/auth/usuarioAtual'
import { ContasPagarService } from '@/lib/services/financeiro/ContasPagarService'
import { ok, serverError } from '@/lib/api/responses'

type P = { params: { tenant: string; id: string } }

// Quitar a conta lança a despesa correspondente — é aqui que o custo entra no
// DRE. O usuário real fica gravado como autor dela; antes ia 1 fixo.
export async function POST(req: NextRequest, { params }: P) {
  try {
    const tenant = await resolveTenant(params.tenant)
    await exigirModulo(tenant.schemaName, 'financeiro')
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const body   = await req.json()
      const userId = await usuarioAtualIdDb(db)
      return ok(await new ContasPagarService(db).baixar(Number(params.id), {
        valorPago:       Math.round((body.valorPago ?? 0) * 100),
        dataPagamento:   body.dataPagamento,
        formaPagamento:  body.formaPagamento,
        contaBancariaId: body.contaBancariaId,
      }, userId))
    } finally { release() }
  } catch (err) { return serverError(err) }
}