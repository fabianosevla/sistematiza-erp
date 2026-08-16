// @ts-nocheck
// ESTE ARQUIVO VAI EM: app/api/[tenant]/cadastros/produtos/[id]/composicao/route.ts
//
// Composição total (ficha explodida) do produto — apoio à tabela nutricional.
// ?multiplicador=12 calcula para um lote de 12 unidades.
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { exigirModulo } from '@/lib/auth/permissoes'
import { getDbForTenant } from '@/lib/db/connection'
import { ComposicaoService } from '@/lib/services/cadastros/ComposicaoService'
import { ok } from '@/lib/api/responses'

type Params = { params: { tenant: string; id: string } }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    await exigirModulo(tenant.schemaName, 'cadastros')
    const { searchParams } = new URL(req.url)
    const multiplicador = Math.max(0.000001, Number(searchParams.get('multiplicador') ?? 1) || 1)

    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const service = new ComposicaoService(db)
      return ok(await service.explodir(Number(params.id), multiplicador))
    } finally {
      release()
    }
  } catch (err: any) {
    // ⚠ DIAGNÓSTICO TEMPORÁRIO — devolve o erro real em vez da mensagem genérica.
    // Voltar para `return serverError(err)` depois de resolvido.
    return NextResponse.json({
      status:  'error',
      message: err?.message ?? String(err),
      name:    err?.name,
      code:    err?.code,
      stack:   String(err?.stack ?? '').split('\n').slice(0, 6).join(' | '),
    }, { status: 500 })
  }
}