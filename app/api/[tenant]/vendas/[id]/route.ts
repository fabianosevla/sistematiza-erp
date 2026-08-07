// @ts-nocheck
// ESTE ARQUIVO VAI EM: app/api/[tenant]/vendas/[id]/route.ts
import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { usuarioAtualIdDb } from '@/lib/auth/usuarioAtual'
import { VendaService } from '@/lib/services/vendas/VendaService'
import { ok, serverError, notFound, badRequest } from '@/lib/api/responses'

type Params = { params: { tenant: string; id: string } }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const service = new VendaService(db, tenant.schemaName)
      const result  = await service.findById(Number(params.id))
      if (!result) return notFound('Venda não encontrada')
      return ok(result)
    } finally {
      release()
    }
  } catch (err) {
    return serverError(err)
  }
}

// PUT — corrige os dados da venda que não afetam dinheiro nem estoque:
// cliente, vendedor, entrega e observações. Item, quantidade, preço e forma de
// pagamento não passam por aqui de propósito — para esses, cancela e refaz.
export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const body    = await req.json()
      const userId  = await usuarioAtualIdDb(db)
      const service = new VendaService(db, tenant.schemaName)

      const atualizado = await service.atualizarDados(Number(params.id), {
        clienteId:         body.clienteId,
        nomeClienteAvulso: body.nomeClienteAvulso,
        vendedor:          body.vendedor,
        tipoEntrega:       body.tipoEntrega,
        dataEntrega:       body.dataEntrega,
        enderecoEntrega:   body.enderecoEntrega,
        observacao:        body.observacao,
        observacaoInterna: body.observacaoInterna,
      }, userId)

      if (!atualizado) return notFound('Venda não encontrada ou já cancelada')
      return ok({ atualizado: true })
    } finally {
      release()
    }
  } catch (err) {
    return serverError(err)
  }
}

// DELETE — cancela a venda e desfaz os efeitos dela: devolve estoque de
// produto e de insumo, derruba o rascunho fiscal e estorna o cashback.
//
// A venda não é apagada: fica com active_flg = false e status 'cancelada'.
//
// Antes, esta rota só inativava a linha e estornava cashback — o estoque
// ficava errado em silêncio, e o próprio comentário do código admitia isso.
// O schemaName passou a ser obrigatório na construção do service porque sem
// ele a reversão de insumo iria para o schema errado.
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const userId  = await usuarioAtualIdDb(db)
      const service = new VendaService(db, tenant.schemaName)

      const resultado = await service.cancelar(Number(params.id), userId)
      if (!resultado) return notFound('Venda não encontrada ou já cancelada')

      return ok(resultado)
    } finally {
      release()
    }
  } catch (err) {
    if ((err as Error)?.message === 'SCHEMA_AUSENTE') {
      return badRequest('Não foi possível identificar a empresa desta venda.')
    }
    return serverError(err)
  }
}
