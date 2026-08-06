// @ts-nocheck
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { usuarioAtualIdDb } from '@/lib/auth/usuarioAtual'
import { PlanoAcaoService } from '@/lib/services/plano_acao/PlanoAcaoService'
import { ok, created, serverError } from '@/lib/api/responses'

type Params = { params: { tenant: string } }

const schema = z.object({
  dataAcao:      z.string(),
  identificacao: z.string().min(1).max(200),
  acao:          z.string().min(1),
  responsavel:   z.string().max(100).optional(),
})

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const { searchParams } = new URL(req.url)
      return ok(await new PlanoAcaoService(db).list({
        status: searchParams.get('status') ?? undefined,
        busca:  searchParams.get('busca')  ?? undefined,
      }))
    } finally { release() }
  } catch (err) { return serverError(err) }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const userId  = await usuarioAtualIdDb(db)
      const payload = schema.parse(await req.json())
      return created(await new PlanoAcaoService(db).criar({ ...payload, userId }))
    } finally { release() }
  } catch (err) { return serverError(err) }
}