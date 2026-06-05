import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { ConfiguracoesService } from '@/lib/services/configuracoes/ConfiguracoesService'
import { ok, serverError } from '@/lib/api/responses'

type Params = { params: { tenant: string } }

const updateSchema = z.object({
  comandasAtivo: z.boolean().optional(),
  nomeEmpresa:   z.string().max(200).optional(),
  cnpj:          z.string().max(20).optional(),
  telefone:      z.string().max(20).optional(),
  endereco:      z.string().max(300).optional(),
})

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const service = new ConfiguracoesService(db)
      const result  = await service.get()
      return ok(result)
    } finally {
      release()
    }
  } catch (err) {
    return serverError(err)
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const tenant  = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const body    = await req.json()
      const payload = updateSchema.parse(body)
      const service = new ConfiguracoesService(db)
      const result  = await service.update(payload)
      return ok(result)
    } finally {
      release()
    }
  } catch (err) {
    return serverError(err)
  }
}