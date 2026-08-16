// @ts-nocheck
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { resolveTenant } from '@/lib/auth/tenant'
import { exigirModulo } from '@/lib/auth/permissoes'
import { getDbForTenant } from '@/lib/db/connection'
import { usuarioAtualIdDb } from '@/lib/auth/usuarioAtual'
import { FinanceiroService } from '@/lib/services/financeiro/FinanceiroService'
import { ok, created, serverError } from '@/lib/api/responses'

type Params = { params: { tenant: string } }

const despesaSchema = z.object({
  nome:               z.string().min(2).max(200),
  categoria:          z.string().max(100),
  valor:              z.number().int().min(1),
  dataDespesa:        z.string(),
  recorrente:         z.boolean().default(false),
  periodoRecorrencia: z.string().optional(),
  observacao:         z.string().max(500).optional(),
  // Quando o dinheiro sai. Vazia = a vista. E ela que define a competencia.
  dataPagamento:      z.string().optional().nullable(),
  mes:                z.number().int().min(1).max(12).optional(),
  ano:                z.number().int().min(2020).optional(),
})

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    await exigirModulo(tenant.schemaName, 'financeiro')
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const { searchParams } = new URL(req.url)
      const tipo      = searchParams.get('tipo')
      const now       = new Date()
      const mes       = Number(searchParams.get('mes')  ?? now.getMonth() + 1)
      const ano       = Number(searchParams.get('ano')  ?? now.getFullYear())
      const categoria = searchParams.get('categoria') ?? undefined
      const service   = new FinanceiroService(db, tenant.schemaName)

      if (tipo === 'kpis')           return ok(await service.kpisMes(mes, ano))
      if (tipo === 'dre')            return ok(await service.dreMes(mes, ano))
      if (tipo === 'demonstrativo')  return ok(await service.demonstrativo(ano))

      return ok(await service.listDespesasMes({ mes, ano, categoria }))
    } finally { release() }
  } catch (err) { return serverError(err) }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    await exigirModulo(tenant.schemaName, 'financeiro')
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const payload = despesaSchema.parse(await req.json())
      // Era o literal 1: toda despesa nascia com created_by do mesmo usuário.
      const userId  = await usuarioAtualIdDb(db)
      return created(await new FinanceiroService(db, tenant.schemaName).criar({ ...payload, userId }))
    } finally { release() }
  } catch (err) { return serverError(err) }
}