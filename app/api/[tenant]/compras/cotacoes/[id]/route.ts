// app/api/[tenant]/compras/cotacoes/[id]/route.ts
//
// Usa "acao" (não "tipo") para discriminar a operação POST/PUT — mesmo
// padrão usado em /api/[tenant]/conciliacao, pra não colidir com campos
// de negócio reais.
import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { CotacaoService } from '@/lib/services/compras/CotacaoService'
import { ok, created, serverError, notFound } from '@/lib/api/responses'

type P = { params: { tenant: string; id: string } }

export async function GET(req: NextRequest, { params }: P) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const result = await new CotacaoService(db).findById(Number(params.id))
      if (!result) return notFound('Cotação não encontrada')
      return ok(result)
    } finally { release() }
  } catch (err) { return serverError(err) }
}

// POST — adicionar preço de fornecedor
// body: { acao: 'add-preco', insumoId, nomeInsumo, fornecedorId?, nomeFornecedor, precoUnitario, quantidade }
export async function POST(req: NextRequest, { params }: P) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const body = await req.json()
      const svc  = new CotacaoService(db)

      if (body.acao === 'add-preco') {
        return created(await svc.addPreco({
          cotacaoId:      Number(params.id),
          insumoId:       body.insumoId,
          nomeInsumo:     body.nomeInsumo,
          fornecedorId:   body.fornecedorId,
          nomeFornecedor: body.nomeFornecedor,
          precoUnitario:  Math.round((body.precoUnitario ?? 0) * 100),
          quantidade:     body.quantidade,
          userId: 1,
        }))
      }
      return serverError(new Error('ação inválida'))
    } finally { release() }
  } catch (err) { return serverError(err) }
}

// PUT — selecionar melhor preço OU gerar pedidos finais
// body: { acao: 'selecionar', insumoId, itemId } | { acao: 'gerar-pedidos' }
export async function PUT(req: NextRequest, { params }: P) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const body = await req.json()
      const svc  = new CotacaoService(db)
      const cotacaoId = Number(params.id)

      if (body.acao === 'selecionar') {
        return ok(await svc.selecionarMelhor(cotacaoId, body.insumoId, body.itemId, 1))
      }
      if (body.acao === 'gerar-pedidos') {
        return ok(await svc.gerarPedidos(cotacaoId, 1))
      }
      return serverError(new Error('ação inválida'))
    } finally { release() }
  } catch (err) { return serverError(err) }
}

// DELETE — remover um preço lançado (?itemId=X)
export async function DELETE(req: NextRequest, { params }: P) {
  try {
    const url    = new URL(req.url)
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const itemId = Number(url.searchParams.get('itemId') ?? 0)
      return ok(await new CotacaoService(db).removerPreco(itemId, 1))
    } finally { release() }
  } catch (err) { return serverError(err) }
}