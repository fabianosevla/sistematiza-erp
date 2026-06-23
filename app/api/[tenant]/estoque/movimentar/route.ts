import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { EstoqueService } from '@/lib/services/estoque/EstoqueService'
import { ok, serverError, badRequest } from '@/lib/api/responses'

type Params = { params: { tenant: string } }

const movimentarSchema = z.object({
  entidade:   z.enum(['produto', 'insumo']),
  entidadeId: z.number().int(),
  // CORRECAO: aceita number() sem .int() para não rejeitar
  // valores enviados pelo frontend que possam não ser inteiros estritos.
  // O Math.abs() garante valor positivo.
  tipo:       z.enum(['entrada', 'saida', 'ajuste']),
  quantidade: z.number().min(0.001),
  precoCusto: z.number().int().optional(),
  observacao: z.string().max(500).optional(),
})

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const body = await req.json()
      console.log('[movimentar] body recebido:', JSON.stringify(body))

      let payload: z.infer<typeof movimentarSchema>
      try {
        payload = movimentarSchema.parse(body)
      } catch (zodErr: any) {
        console.error('[movimentar] erro de validacao:', JSON.stringify(zodErr.errors))
        return badRequest('Dados inválidos: ' + JSON.stringify(zodErr.errors))
      }

      console.log('[movimentar] payload validado:', JSON.stringify(payload))
      const service = new EstoqueService(db, tenant.schemaName)
      const result  = await service.movimentar({
        ...payload,
        quantidade: Math.round(payload.quantidade),
        userId: 1,
      })
      console.log('[movimentar] resultado:', JSON.stringify(result))
      return ok(result)
    } finally {
      release()
    }
  } catch (err: any) {
    console.error('[movimentar] erro geral:', err?.message)
    return serverError(err)
  }
}