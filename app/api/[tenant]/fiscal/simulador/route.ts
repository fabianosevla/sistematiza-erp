// @ts-nocheck
// ESTE ARQUIVO VAI EM: app/api/[tenant]/fiscal/simulador/route.ts
//
// SIMULADOR DE CFOP — responde "qual código essa operação gera", sem emitir
// nada. Duas fontes, dependendo do tipo de operação escolhido:
//
//   'Venda'  → resolve pelo PERFIL TRIBUTÁRIO do produto (o mesmo caminho que
//              criarNota() usa de verdade) — CFOP varia por produto.
//   qualquer outra → resolve por t_cfop_regra — CFOP não depende do produto,
//              só do tipo de operação e de mesmo-estado ou não.
import type { NextRequest } from 'next/server'
import { sql } from 'drizzle-orm'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { fiscalLigado } from '@/app/api/[tenant]/fiscal/perfis/route'
import { ok, forbidden, serverError, badRequest } from '@/lib/api/responses'

type Params = { params: { tenant: string } }

const TIPO_VENDA = 'Venda'

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      if (!(await fiscalLigado(db))) return forbidden()
      const { searchParams } = new URL(req.url)
      const tipoOperacao = searchParams.get('tipoOperacao') ?? ''
      const ufDestino     = (searchParams.get('ufDestino') ?? '').toUpperCase()
      if (!tipoOperacao) return badRequest('Escolha o tipo de operação.')
      if (!/^[A-Z]{2}$/.test(ufDestino)) return badRequest('Escolha o estado de destino.')

      const cfgRes = await db.execute(sql`SELECT uf, crt FROM t_configuracoes_tenant LIMIT 1`)
      const cfg: any = (cfgRes.rows as any[])[0] ?? {}
      const ufEmpresa   = String(cfg.uf ?? '').toUpperCase()
      const mesmoEstado = !!ufEmpresa && ufEmpresa === ufDestino
      const simples      = ['1', '2'].includes(String(cfg.crt ?? ''))

      if (tipoOperacao === TIPO_VENDA) {
        const produtoId    = Number(searchParams.get('produtoId') ?? 0)
        const destinatario = searchParams.get('destinatario') === 'contribuinte' ? 'contribuinte' : 'consumidor_final'
        if (!produtoId) return badRequest('Escolha o produto.')

        const r = await db.execute(sql`
          SELECT p.nome AS produto_nome, p.ncm, p.cest, p.origem,
                 pt.perfil_trib_id, pt.nome AS perfil_nome,
                 pt.cfop_interno, pt.cfop_interestadual, pt.csosn, pt.cst_icms, pt.aliq_icms,
                 pt.tem_st, pt.mva, pt.aliq_icms_st,
                 pt.cst_pis, pt.aliq_pis, pt.cst_cofins, pt.aliq_cofins, pt.cst_ipi, pt.aliq_ipi
            FROM t_produto p
            LEFT JOIN t_perfil_tributario pt
              ON pt.perfil_trib_id = CASE WHEN ${destinatario} = 'contribuinte'
                                           THEN p.perfil_trib_id ELSE p.perfil_trib_consumidor_final_id END
           WHERE p.produto_id = ${produtoId}
        `)
        const row: any = (r.rows as any[])[0]
        if (!row) return badRequest('Produto não encontrado.')
        if (!row.perfil_trib_id) {
          return ok({
            tipoOperacao, mesmoEstado, produtoNome: row.produto_nome,
            faltaPerfil: destinatario === 'contribuinte'
              ? 'Este produto não tem perfil tributário de venda a contribuinte.'
              : 'Este produto não tem perfil tributário de venda a consumidor final.',
          })
        }

        // MVA/alíquota por estado, quando cadastrado — mesma busca que a
        // emissão de verdade faz (ver criarNota em FiscalService).
        let mva = row.mva, aliqIcmsSt = row.aliq_icms_st, mvaPorEstado = false
        if (row.tem_st) {
          const ufRow = await db.execute(sql`
            SELECT mva, aliq_icms_st FROM t_icms_st_uf
             WHERE perfil_trib_id = ${row.perfil_trib_id} AND uf_destino = ${ufDestino} AND active_flg = true
             LIMIT 1
          `)
          const linhaUf: any = (ufRow.rows as any[])[0]
          if (linhaUf) { mva = linhaUf.mva; aliqIcmsSt = linhaUf.aliq_icms_st; mvaPorEstado = true }
        }

        return ok({
          tipoOperacao, mesmoEstado, destinatario,
          produtoNome: row.produto_nome, ncm: row.ncm, cest: row.cest,
          perfilNome:  row.perfil_nome,
          cfop:        mesmoEstado ? row.cfop_interno : row.cfop_interestadual,
          csosnOuCst:  simples ? row.csosn : row.cst_icms,
          regimeLabel: simples ? 'CSOSN (Simples Nacional)' : 'CST (regime normal)',
          aliqIcms:    row.aliq_icms,
          temSt:       row.tem_st,
          mva, aliqIcmsSt, mvaPorEstado,
          cstPis:      row.cst_pis, aliqPis: row.aliq_pis,
          cstCofins:   row.cst_cofins, aliqCofins: row.aliq_cofins,
          cstIpi:      row.cst_ipi, aliqIpi: row.aliq_ipi,
        })
      }

      // Qualquer outra operação: resolve por t_cfop_regra.
      const r = await db.execute(sql`
        SELECT cfop, direcao, localizacao, observacao
          FROM t_cfop_regra
         WHERE tipo_operacao = ${tipoOperacao}
           AND localizacao = ${mesmoEstado ? 'interno' : 'interestadual'}
           AND active_flg = true
         LIMIT 1
      `)
      const row: any = (r.rows as any[])[0]
      if (!row) {
        return ok({
          tipoOperacao, mesmoEstado,
          faltaRegra: `Não existe regra cadastrada para "${tipoOperacao}" ${mesmoEstado ? 'dentro do estado' : 'fora do estado'}. Cadastre em "Outras operações (CFOP)".`,
        })
      }
      return ok({
        tipoOperacao, mesmoEstado,
        cfop: row.cfop, direcao: row.direcao, observacao: row.observacao,
      })
    } finally { release() }
  } catch (err) { return serverError(err) }
}
