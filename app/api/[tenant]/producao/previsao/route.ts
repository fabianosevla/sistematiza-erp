// @ts-nocheck
// app/api/[tenant]/producao/previsao/route.ts
//
// A tela de Produção chama esta rota com ?inicio=&fim=, mas a versão anterior
// só lia dataInicio/dataFim — e caía no default (hoje), devolvendo previsão
// vazia. Agora aceita os dois nomes, igual à rota /producao/grade.
import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { exigirModulo } from '@/lib/auth/permissoes'
import { getDbForTenant } from '@/lib/db/connection'
import { ProducaoService } from '@/lib/services/producao/ProducaoService'
import { ok, serverError } from '@/lib/api/responses'

type Params = { params: { tenant: string } }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    await exigirModulo(tenant.schemaName, 'producao')
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const { searchParams } = new URL(req.url)
      const hoje = new Date().toISOString().slice(0, 10)
      const dataInicio = searchParams.get('inicio') ?? searchParams.get('dataInicio') ?? hoje
      const dataFim    = searchParams.get('fim')    ?? searchParams.get('dataFim')    ?? hoje
      return ok(await new ProducaoService(db).getPrevisaoInsumos(dataInicio, dataFim))
    } finally { release() }
  } catch (err) { return serverError(err) }
}