// @ts-nocheck
import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { ConsultasService } from '@/lib/services/consultas/ConsultasService'
import { ok, serverError } from '@/lib/api/responses'

type Params = { params: { tenant: string } }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const { searchParams } = new URL(req.url)
      const tipo        = searchParams.get('tipo') ?? 'vendas'
      const dataInicio  = searchParams.get('dataInicio') ?? undefined
      const dataFim     = searchParams.get('dataFim')    ?? undefined
      const page        = Number(searchParams.get('page')  ?? 1)
      const limit       = Number(searchParams.get('limit') ?? 20)
      const service     = new ConsultasService(db)

      if (tipo === 'vendas')          return ok(await service.listVendas({ dataInicio, dataFim, page, limit }))
      if (tipo === 'por-produto')     return ok(await service.listVendasPorProduto({ dataInicio, dataFim }))
      if (tipo === 'insumos')         return ok(await service.listInsumos())
      if (tipo === 'produtos')        return ok(await service.listProdutos())
      return ok([])
    } finally { release() }
  } catch (err) { return serverError(err) }
}