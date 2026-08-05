// @ts-nocheck
// ESTE ARQUIVO VAI EM: app/api/[tenant]/pedidos/route.ts
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { PedidoService } from '@/lib/services/producao/PedidoService'
import { ok, created, serverError } from '@/lib/api/responses'

type Params = { params: { tenant: string } }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const { searchParams } = new URL(req.url)
      const status  = searchParams.get('status') ?? undefined
      // A tela sempre mandou `periodo`; esta rota lia só `status` e o
      // descartava aqui, antes de chegar no service. Por isso o seletor de
      // período não surtia efeito nenhum na listagem.
      const periodo = searchParams.get('periodo') ?? undefined
      const service = new PedidoService(db)
      const result  = await service.list({ status, periodo })
      return ok(result)
    } finally {
      release()
    }
  } catch (err) {
    return serverError(err)
  }
}

const criarPedidoSchema = z.object({
  clienteId:        z.number().int().optional(),
  // Cliente avulso: quem compra uma vez e não vale cadastrar. Guarda só o
  // nome — sem histórico, sem tabela de preço, e a conta a receber gerada na
  // entrega fica sem vínculo de cliente.
  nomeClienteAvulso: z.string().max(200).optional().nullable(),
  tipoVenda:        z.enum(['balcao', 'entrega']).default('entrega'),
  dataPedido:       z.string(),
  previsaoProducao: z.string().optional(),
  previsaoEntrega:  z.string().optional(),
  valorEntrega:     z.number().int().default(0),
  enderecoEntrega:  z.string().max(300).optional(),
  observacao:       z.string().max(500).optional(),
  itens: z.array(z.object({
    produtoId:     z.number().int(),
    quantidade:    z.number().int().min(1),
    precoUnitario: z.number().int().default(0),
  })).min(1),
})

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const body    = await req.json()
      const payload = criarPedidoSchema.parse(body)
      const service = new PedidoService(db)
      const result  = await service.criar({ ...payload, userId: 1 })
      return created(result)
    } finally {
      release()
    }
  } catch (err) {
    return serverError(err)
  }
}