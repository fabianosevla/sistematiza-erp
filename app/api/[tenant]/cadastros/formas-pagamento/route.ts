// @ts-nocheck
// ESTE ARQUIVO VAI EM: app/api/[tenant]/cadastros/formas-pagamento/route.ts
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { usuarioAtualIdDb } from '@/lib/auth/usuarioAtual'
import { FormaPagamentoService } from '@/lib/services/cadastros/FormaPagamentoService'
import { ok, created, serverError } from '@/lib/api/responses'

type Params = { params: { tenant: string } }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const service = new FormaPagamentoService(db)
      return ok(await service.list())
    } finally {
      release()
    }
  } catch (err) {
    return serverError(err)
  }
}

const schema = z.object({
  nome:       z.string().min(2).max(100),
  taxa:       z.number().min(0).default(0),
  observacao: z.string().max(200).optional(),
})

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const body    = await req.json()
      const payload = schema.parse(body)
      const uid     = await usuarioAtualIdDb(db)   // antes: literal 1
      const service = new FormaPagamentoService(db)
      return created(await service.criar({ ...payload, userId: uid }))
    } finally {
      release()
    }
  } catch (err) {
    return serverError(err)
  }
}