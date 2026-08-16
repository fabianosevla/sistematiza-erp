// app/api/[tenant]/contas-receber/[id]/baixar/route.ts
import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { exigirModulo } from '@/lib/auth/permissoes'
import { getDbForTenant } from '@/lib/db/connection'
import { usuarioAtualIdDb } from '@/lib/auth/usuarioAtual'
import { ContasReceberService } from '@/lib/services/financeiro/ContasReceberService'
import { ok, serverError } from '@/lib/api/responses'

type P = { params: { tenant: string; id: string } }

// Quitar uma conta vinda de pedido cria a venda correspondente — é aqui que o
// faturamento nasce. Por isso o usuário real importa: ele fica gravado como
// created_by da venda. Antes esta rota mandava 1 fixo.
export async function POST(req: NextRequest, { params }: P) {
  try {
    const tenant = await resolveTenant(params.tenant)
    await exigirModulo(tenant.schemaName, 'financeiro')
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const body   = await req.json()
      const userId = await usuarioAtualIdDb(db)
      return ok(await new ContasReceberService(db).baixar(Number(params.id), {
        valorRecebido:    Math.round((body.valorRecebido ?? 0) * 100),
        dataRecebimento:  body.dataRecebimento,
        formaRecebimento: body.formaRecebimento,
        contaBancariaId:  body.contaBancariaId,
      }, userId))
    } finally { release() }
  } catch (err) { return serverError(err) }
}