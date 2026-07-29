// @ts-nocheck
// app/api/[tenant]/producao/registrar/route.ts
//
// Registro de produção: debita insumo E soma no estoque do produto, numa
// transação só. Substitui o uso de /producao/baixar-insumos, que só fazia
// a metade da operação (debitava e não somava).
//
// GET  ?inicio=&fim=            → registros da semana (grade marca realizados)
// POST { produtoId, dataProducao, qtdPlanejada, qtdProduzida, confirmar }
//        confirmar=false → prévia   |   confirmar=true → grava
import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { ProducaoRegistroService } from '@/lib/services/producao/ProducaoRegistroService'
import { ok, serverError, badRequest } from '@/lib/api/responses'

type Params = { params: { tenant: string } }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const { searchParams } = new URL(req.url)
      const hoje   = new Date().toISOString().slice(0, 10)
      const inicio = searchParams.get('inicio') ?? searchParams.get('dataInicio') ?? hoje
      const fim    = searchParams.get('fim')    ?? searchParams.get('dataFim')    ?? hoje
      const svc = new ProducaoRegistroService(db, tenant.schemaName)
      return ok(await svc.listarPorPeriodo(inicio, fim))
    } finally { release() }
  } catch (err) { return serverError(err) }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const body = await req.json()

      const produtoId    = Number(body.produtoId)
      const qtdProduzida = Number(body.qtdProduzida ?? body.quantidade)
      const qtdPlanejada = Number(body.qtdPlanejada ?? qtdProduzida)
      const dataProducao = String(body.dataProducao ?? new Date().toISOString().slice(0, 10))
      const baseConsumo  = body.baseConsumo === 'produzida' ? 'produzida' : 'planejada'
      const confirmar    = body.confirmar === true

      if (!produtoId)             return badRequest('produtoId é obrigatório')
      if (!(qtdProduzida > 0))    return badRequest('Quantidade produzida deve ser maior que zero')

      const svc = new ProducaoRegistroService(db, tenant.schemaName)

      if (!confirmar) {
        return ok(await svc.simular({ produtoId, qtdPlanejada, qtdProduzida, baseConsumo }))
      }

      return ok(await svc.registrar({
        produtoId, dataProducao, qtdPlanejada, qtdProduzida, baseConsumo,
        observacao: body.observacao,
        userId: 1,
      }))
    } finally { release() }
  } catch (err) { return serverError(err) }
}