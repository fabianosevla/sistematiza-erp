// @ts-nocheck
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { ConfiguracoesService } from '@/lib/services/configuracoes/ConfiguracoesService'
import { ok, serverError } from '@/lib/api/responses'

type Params = { params: { tenant: string } }

const updateSchema = z.object({
  comandasAtivo:    z.boolean().optional(),
  producaoAtivo:    z.boolean().optional(),
  estoqueAtivo:     z.boolean().optional(),
  fiscalAtivo:      z.boolean().optional(),
  consultasAtivo:   z.boolean().optional(),
  pedidosAtivo:     z.boolean().optional(),
  planoAcaoAtivo:   z.boolean().optional(),
  nomeEmpresa:      z.string().max(200).optional(),
  cnpj:             z.string().max(20).optional(),
  telefone:         z.string().max(20).optional(),
  endereco:         z.string().max(300).optional(),
  ieEstadual:       z.string().max(30).optional(),
  regimeTributario: z.string().max(5).optional(),
  uf:               z.string().max(2).optional(),
  focusNfeToken:    z.string().max(200).optional(),
  focusNfeAmbiente: z.string().max(20).optional(),
})

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try { return ok(await new ConfiguracoesService(db).get()) }
    finally { release() }
  } catch (err) { return serverError(err) }
}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const payload = updateSchema.parse(await req.json())
      return ok(await new ConfiguracoesService(db).update(payload))
    } finally { release() }
  } catch (err) { return serverError(err) }
}