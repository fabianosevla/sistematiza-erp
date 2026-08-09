// @ts-nocheck
// ESTE ARQUIVO VAI EM: app/api/[tenant]/caixa/route.ts
//
// Rota própria, fora do fiscal. Caixa é controle de dinheiro: quem não emite
// nota ainda precisa conferir a gaveta, e quem emite pode não querer conferir.
import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { usuarioAtualIdDb } from '@/lib/auth/usuarioAtual'
import { CaixaService } from '@/lib/services/caixa/CaixaService'
import { ok, created, serverError, badRequest } from '@/lib/api/responses'

type Params = { params: { tenant: string } }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const { searchParams } = new URL(req.url)
      const svc = new CaixaService(db)

      if (searchParams.get('historico') === 'true') {
        return ok(await svc.historico({
          dataInicio: searchParams.get('dataInicio') ?? undefined,
          dataFim:    searchParams.get('dataFim')    ?? undefined,
        }))
      }

      const turnoId = searchParams.get('turnoId')
      if (turnoId) return ok(await svc.resumo(Number(turnoId)))

      // Sem parâmetro: os turnos abertos. No regime por dia é um; no regime
      // por operador, um por caixa.
      const abertos = await svc.abertos()
      const numeroCaixa = searchParams.get('numeroCaixa')
      const meu = await svc.turnoDaVenda(numeroCaixa ? Number(numeroCaixa) : undefined)
      return ok({ abertos, meu })
    } finally { release() }
  } catch (err) { return serverError(err) }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const { searchParams } = new URL(req.url)
      const acao   = searchParams.get('acao')
      const body   = await req.json()
      const userId = await usuarioAtualIdDb(db)
      const svc    = new CaixaService(db)

      if (acao === 'abrir') {
        return created(await svc.abrir({
          operador:      String(body.operador ?? '').trim(),
          numeroCaixa:   Number(body.numeroCaixa ?? 1),
          valorAbertura: Math.round(Number(body.valorAbertura ?? 0)),
          userId,
        }))
      }

      if (acao === 'movimentar') {
        return created(await svc.movimentar({
          turnoId: Number(body.turnoId),
          tipo:    body.tipo,
          valor:   Math.round(Number(body.valor ?? 0)),
          motivo:  body.motivo,
          userId,
        }))
      }

      if (acao === 'fechar') {
        return ok(await svc.fechar({
          turnoId:         Number(body.turnoId),
          valorFechamento: Math.round(Number(body.valorFechamento ?? 0)),
          observacao:      body.observacao,
          userId,
        }))
      }

      return badRequest('Ação não reconhecida.')
    } finally { release() }
  } catch (err) {
    // Regras de negócio do caixa — "já existe um caixa aberto", "turno já
    // fechado" — são resposta esperada, não erro de servidor.
    const msg = (err as Error)?.message ?? ''
    if (/já|turno|caixa|valor|Tipo/i.test(msg)) return badRequest(msg)
    return serverError(err)
  }
}
