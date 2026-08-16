// app/api/[tenant]/estoque/contagens/[id]/route.ts
import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { exigirModulo } from '@/lib/auth/permissoes'
import { getDbForTenant } from '@/lib/db/connection'
import { ContagemInventarioService } from '@/lib/services/estoque/ContagemInventarioService'
import { ok, serverError, notFound } from '@/lib/api/responses'

type P = { params: { tenant: string; id: string } }

export async function GET(req: NextRequest, { params }: P) {
  try {
    const tenant = await resolveTenant(params.tenant)
    await exigirModulo(tenant.schemaName, 'estoque')
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const result = await new ContagemInventarioService(db, tenant.schemaName).findById(Number(params.id))
      if (!result) return notFound('Contagem não encontrada')
      return ok(result)
    } finally { release() }
  } catch (err) { return serverError(err) }
}

// body: { acao: 'lancar-item', itemId, quantidadeContada } | { acao: 'finalizar' }
export async function PUT(req: NextRequest, { params }: P) {
  try {
    const tenant = await resolveTenant(params.tenant)
    await exigirModulo(tenant.schemaName, 'estoque')
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const body = await req.json()
      // schemaName é obrigatório: sem ele o ajuste de estoque iria para o
      // schema errado caso a contagem passe a debitar insumo no futuro.
      const svc = new ContagemInventarioService(db, tenant.schemaName)

      if (body.acao === 'lancar-item') {
        return ok(await svc.lancarItem(body.itemId, body.quantidadeContada, 1))
      }
      if (body.acao === 'finalizar') {
        return ok(await svc.finalizar(Number(params.id), 1))
      }
      return serverError(new Error('ação inválida'))
    } finally { release() }
  } catch (err) { return serverError(err) }
}