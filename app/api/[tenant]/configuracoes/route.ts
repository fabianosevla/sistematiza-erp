// @ts-nocheck
import type { NextRequest } from 'next/server'
import { sql } from 'drizzle-orm'
import { resolveTenant }  from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { ok, serverError } from '@/lib/api/responses'

type Params = { params: { tenant: string } }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const result = await db.execute(sql`
        SELECT * FROM t_configuracoes_tenant WHERE active_flg = true LIMIT 1
      `)
      const r = result.rows[0] as any
      if (!r) return ok({})
      return ok({
        comandasAtivo:    r.comandas_ativo    ?? false,
        producaoAtivo:    r.producao_ativo    ?? true,
        estoqueAtivo:     r.estoque_ativo     ?? true,
        fiscalAtivo:      r.fiscal_ativo      ?? false,
        consultasAtivo:   r.consultas_ativo   ?? true,
        pedidosAtivo:     r.pedidos_ativo     ?? true,
        planoAcaoAtivo:   r.plano_acao_ativo  ?? true,
        metasAtivo:       r.metas_ativo       ?? true,
        nomeEmpresa:      r.nome_empresa      ?? '',
        cnpj:             r.cnpj              ?? '',
        ieEstadual:       r.ie_estadual       ?? '',
        uf:               r.uf                ?? '',
        regimeTributario: r.regime_tributario ?? '',
        telefone:         r.telefone          ?? '',
        endereco:         r.endereco          ?? '',
        focusNfeToken:    r.focus_nfe_token   ?? '',
        focusNfeAmbiente: r.focus_nfe_ambiente ?? 'homologacao',
      })
    } finally { release() }
  } catch (err) { return serverError(err) }
}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const body = await req.json()
      const now  = new Date().toISOString()
      const ops: Promise<any>[] = []

      if ('comandasAtivo'    in body) ops.push(db.execute(sql`UPDATE t_configuracoes_tenant SET comandas_ativo    = ${body.comandasAtivo}    WHERE active_flg = true`))
      if ('producaoAtivo'    in body) ops.push(db.execute(sql`UPDATE t_configuracoes_tenant SET producao_ativo    = ${body.producaoAtivo}    WHERE active_flg = true`))
      if ('estoqueAtivo'     in body) ops.push(db.execute(sql`UPDATE t_configuracoes_tenant SET estoque_ativo     = ${body.estoqueAtivo}     WHERE active_flg = true`))
      if ('fiscalAtivo'      in body) ops.push(db.execute(sql`UPDATE t_configuracoes_tenant SET fiscal_ativo      = ${body.fiscalAtivo}      WHERE active_flg = true`))
      if ('consultasAtivo'   in body) ops.push(db.execute(sql`UPDATE t_configuracoes_tenant SET consultas_ativo   = ${body.consultasAtivo}   WHERE active_flg = true`))
      if ('pedidosAtivo'     in body) ops.push(db.execute(sql`UPDATE t_configuracoes_tenant SET pedidos_ativo     = ${body.pedidosAtivo}     WHERE active_flg = true`))
      if ('planoAcaoAtivo'   in body) ops.push(db.execute(sql`UPDATE t_configuracoes_tenant SET plano_acao_ativo  = ${body.planoAcaoAtivo}   WHERE active_flg = true`))
      if ('metasAtivo'       in body) ops.push(db.execute(sql`UPDATE t_configuracoes_tenant SET metas_ativo       = ${body.metasAtivo}       WHERE active_flg = true`))
      if ('nomeEmpresa'      in body) ops.push(db.execute(sql`UPDATE t_configuracoes_tenant SET nome_empresa      = ${body.nomeEmpresa}      WHERE active_flg = true`))
      if ('cnpj'             in body) ops.push(db.execute(sql`UPDATE t_configuracoes_tenant SET cnpj              = ${body.cnpj}             WHERE active_flg = true`))
      if ('ieEstadual'       in body) ops.push(db.execute(sql`UPDATE t_configuracoes_tenant SET ie_estadual       = ${body.ieEstadual}       WHERE active_flg = true`))
      if ('uf'               in body) ops.push(db.execute(sql`UPDATE t_configuracoes_tenant SET uf                = ${body.uf}               WHERE active_flg = true`))
      if ('regimeTributario' in body) ops.push(db.execute(sql`UPDATE t_configuracoes_tenant SET regime_tributario = ${body.regimeTributario} WHERE active_flg = true`))
      if ('telefone'         in body) ops.push(db.execute(sql`UPDATE t_configuracoes_tenant SET telefone          = ${body.telefone}         WHERE active_flg = true`))
      if ('endereco'         in body) ops.push(db.execute(sql`UPDATE t_configuracoes_tenant SET endereco          = ${body.endereco}         WHERE active_flg = true`))
      if ('focusNfeToken'    in body) ops.push(db.execute(sql`UPDATE t_configuracoes_tenant SET focus_nfe_token   = ${body.focusNfeToken}    WHERE active_flg = true`))
      if ('focusNfeAmbiente' in body) ops.push(db.execute(sql`UPDATE t_configuracoes_tenant SET focus_nfe_ambiente = ${body.focusNfeAmbiente} WHERE active_flg = true`))

      await Promise.all(ops)
      return ok({ ok: true })
    } finally { release() }
  } catch (err) { return serverError(err) }
}