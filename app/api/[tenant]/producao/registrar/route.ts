// @ts-nocheck
// app/api/[tenant]/producao/registrar/route.ts
//
// Registro de produção: debita insumo E soma no estoque do produto, numa
// transação só. Substitui /producao/baixar-insumos, que fazia só a metade
// da operação (debitava e não somava).
//
// GET  ?inicio=&fim=  → registros do período; a grade usa para pintar de
//                       cinza as células já lançadas e travar a edição.
//
// POST — dois formatos:
//   { itens: [{ produtoId, dataProducao, quantidade }], confirmar }
//       lote, usado pelo botão "Registrar Produção" da grade
//   { produtoId, dataProducao, qtdProduzida, confirmar }
//       registro avulso de um produto
//
//   confirmar = false → prévia (nada é gravado)
//   confirmar = true  → grava
import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { exigirModulo } from '@/lib/auth/permissoes'
import { getDbForTenant } from '@/lib/db/connection'
import { ProducaoRegistroService } from '@/lib/services/producao/ProducaoRegistroService'
import { ok, serverError, badRequest } from '@/lib/api/responses'

type Params = { params: { tenant: string } }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    await exigirModulo(tenant.schemaName, 'producao')
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
    await exigirModulo(tenant.schemaName, 'producao')
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const body      = await req.json()
      const confirmar = body.confirmar === true
      const svc       = new ProducaoRegistroService(db, tenant.schemaName)

      // ── Lote (grade) ───────────────────────────────────────────────────
      if (Array.isArray(body.itens)) {
        const itens = body.itens
          .map((i: any) => ({
            produtoId:    Number(i.produtoId),
            dataProducao: String(i.dataProducao),
            quantidade:   Number(i.quantidade),
          }))
          .filter((i: any) => i.produtoId > 0 && i.quantidade > 0 && i.dataProducao)

        if (itens.length === 0) return badRequest('Nenhuma célula com quantidade para registrar')

        if (!confirmar) return ok(await svc.simularLote(itens))
        return ok(await svc.registrarLote({ itens, observacao: body.observacao, userId: 1 }))
      }

      // ── Avulso ─────────────────────────────────────────────────────────
      const produtoId    = Number(body.produtoId)
      const qtdProduzida = Number(body.qtdProduzida ?? body.quantidade)
      const qtdPlanejada = Number(body.qtdPlanejada ?? qtdProduzida)
      const dataProducao = String(body.dataProducao ?? new Date().toISOString().slice(0, 10))

      if (!produtoId)          return badRequest('produtoId é obrigatório')
      if (!(qtdProduzida > 0)) return badRequest('Quantidade produzida deve ser maior que zero')

      if (!confirmar) {
        return ok(await svc.simular({ produtoId, qtdPlanejada, qtdProduzida }))
      }
      return ok(await svc.registrar({
        produtoId, dataProducao, qtdPlanejada, qtdProduzida,
        observacao: body.observacao, userId: 1,
      }))
    } finally { release() }
  } catch (err) { return serverError(err) }
}