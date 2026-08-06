// @ts-nocheck
// ESTE ARQUIVO VAI EM: app/api/[tenant]/consultas/route.ts
//
// Duas consultas, mesma assinatura de período:
//   ?tipo=vendas           &dataInicio=YYYY-MM-DD&dataFim=YYYY-MM-DD
//   ?tipo=entradas-estoque &dataInicio=YYYY-MM-DD&dataFim=YYYY-MM-DD
//
// Os tipos antigos ('por-produto', 'insumos', 'produtos') saíram: os dois
// últimos eram a listagem de cadastro, que já existe em Estoque e Cadastros.
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
      const tipo       = searchParams.get('tipo') ?? 'vendas'
      const dataInicio = searchParams.get('dataInicio') ?? undefined
      const dataFim    = searchParams.get('dataFim')    ?? undefined
      const service    = new ConsultasService(db)

      // entradas-produto / entradas-insumo: mesma consulta, recorte por entidade.
      if (tipo === 'entradas-produto') return ok(await service.entradasEstoquePorPeriodo({ dataInicio, dataFim, entidade: 'produto' }))
      if (tipo === 'entradas-insumo')  return ok(await service.entradasEstoquePorPeriodo({ dataInicio, dataFim, entidade: 'insumo' }))
      if (tipo === 'entradas-estoque') return ok(await service.entradasEstoquePorPeriodo({ dataInicio, dataFim }))
      if (tipo === 'vendas-produto') return ok(await service.vendasPorProdutoPorPeriodo({ dataInicio, dataFim }))
      if (tipo === 'dre')      return ok(await service.drePorPeriodo({ dataInicio, dataFim }))
      if (tipo === 'despesas') {
        return ok(await service.despesasPorPeriodo({
          dataInicio, dataFim,
          incluirFixos: searchParams.get('fixos') !== '0',
        }))
      }
      return ok(await service.vendasPorPeriodo({ dataInicio, dataFim }))
    } finally { release() }
  } catch (err) { return serverError(err) }
}
