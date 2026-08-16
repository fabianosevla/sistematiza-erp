// app/api/[tenant]/estoque/movimentar/route.ts
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { resolveTenant } from '@/lib/auth/tenant'
import { exigirModulo } from '@/lib/auth/permissoes'
import { getDbForTenant } from '@/lib/db/connection'
import { EstoqueService } from '@/lib/services/estoque/EstoqueService'
import { ok, serverError, badRequest } from '@/lib/api/responses'

type Params = { params: { tenant: string } }

const movimentarSchema = z.object({
  entidade:   z.enum(['produto', 'insumo']),
  entidadeId: z.number().int(),
  tipo:       z.enum(['entrada', 'saida', 'ajuste']),
  // Sem .int(): insumo é movimentado em fração (0,5 kg de farinha).
  quantidade: z.number().min(0.001),
  precoCusto: z.number().int().optional(),
  observacao: z.string().max(500).optional(),
})

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    await exigirModulo(tenant.schemaName, 'estoque')
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const body = await req.json()

      let payload: z.infer<typeof movimentarSchema>
      try {
        payload = movimentarSchema.parse(body)
      } catch (zodErr: any) {
        return badRequest('Dados inválidos: ' + JSON.stringify(zodErr.errors))
      }

      const service = new EstoqueService(db, tenant.schemaName)

      // A quantidade segue como veio. A versão anterior fazia
      // Math.round(payload.quantidade) aqui, e 0,5 kg de insumo virava 1 —
      // porque t_movimentacao_estoque.quantidade era INTEGER. A coluna passou
      // a ser NUMERIC(12,3) em scripts/migrate-producao-registro.js, então o
      // arredondamento não é mais necessário nem desejado.
      const result = await service.movimentar({ ...payload, userId: 1 })

      return ok(result)
    } finally {
      release()
    }
  } catch (err: any) {
    return serverError(err)
  }
}