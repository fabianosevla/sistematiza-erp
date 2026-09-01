// @ts-nocheck
// ESTE ARQUIVO VAI EM: app/api/[tenant]/fiscal/ncm-referencia/route.ts
import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { exigirModulo } from '@/lib/auth/permissoes'
import { getDbForTenant } from '@/lib/db/connection'
import { usuarioAtualIdDb } from '@/lib/auth/usuarioAtual'
import { NcmReferenciaService } from '@/lib/services/fiscal/NcmReferenciaService'
import { fiscalLigado } from '@/app/api/[tenant]/fiscal/perfis/route'
import { ok, created, serverError, badRequest, forbidden } from '@/lib/api/responses'

type Params = { params: { tenant: string } }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      if (!(await fiscalLigado(db))) return forbidden()
      const { searchParams } = new URL(req.url)
      const termo = searchParams.get('termo') ?? undefined
      const resultados = await new NcmReferenciaService(db).buscar(termo)
      return ok({ resultados })
    } finally { release() }
  } catch (err) { return serverError(err) }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    await exigirModulo(tenant.schemaName, 'fiscal')
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      if (!(await fiscalLigado(db))) return forbidden()
      const body = await req.json()
      if (!/^\d{8}$/.test(String(body.ncm ?? '').replace(/\D/g, ''))) return badRequest('NCM precisa ter 8 dígitos.')
      if (!String(body.descricao ?? '').trim()) return badRequest('Informe a descrição.')
      const userId = await usuarioAtualIdDb(db)
      return created(await new NcmReferenciaService(db).criar(body, userId))
    } finally { release() }
  } catch (err) { return serverError(err) }
}
