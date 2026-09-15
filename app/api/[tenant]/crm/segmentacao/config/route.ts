// app/api/[tenant]/crm/segmentacao/config/route.ts
//
// Limiares de dias que definem os baldes de Segmentação (ativo/em risco/
// sumindo/inativo) — configuráveis por tenant desde 15/09/2026.
// GET -> devolve os 3 valores atuais.
// PUT -> valida (inteiros positivos, em ordem crescente) e grava.
import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { exigirModulo } from '@/lib/auth/permissoes'
import { getDbForTenant } from '@/lib/db/connection'
import { SegmentacaoService } from '@/lib/services/crm/SegmentacaoService'
import { ok, serverError, badRequest } from '@/lib/api/responses'

type Params = { params: { tenant: string } }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    await exigirModulo(tenant.schemaName, 'crm')
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      return ok(await new SegmentacaoService(db).getLimiares())
    } finally { release() }
  } catch (err) { return serverError(err) }
}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    await exigirModulo(tenant.schemaName, 'crm')
    const b = await req.json()

    const ativoDias   = Number(b.ativoDias)
    const riscoDias   = Number(b.riscoDias)
    const sumindoDias = Number(b.sumindoDias)

    // Inteiros positivos — dia fracionado ou negativo não faz sentido aqui.
    if (![ativoDias, riscoDias, sumindoDias].every(n => Number.isInteger(n) && n > 0)) {
      return badRequest('Os três valores precisam ser números inteiros maiores que zero.')
    }
    // A ordem tem que ser estritamente crescente — senão os baldes viram
    // bobagem (ex.: "em risco" com prazo menor que "ativo" nunca seria
    // alcançado, ou classificaria cliente errado).
    if (!(ativoDias < riscoDias && riscoDias < sumindoDias)) {
      return badRequest('Os prazos precisam ser crescentes: Ativo < Em risco < Sumindo.')
    }

    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      await new SegmentacaoService(db).salvarLimiares({ ativoDias, riscoDias, sumindoDias })
      return ok({ ok: true })
    } finally { release() }
  } catch (err) { return serverError(err) }
}
