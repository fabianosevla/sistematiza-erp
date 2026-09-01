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
import { FiscalService } from '@/lib/services/fiscal/FiscalService'
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

      if (tipoOperacao === TIPO_VENDA) {
        const produtoId    = Number(searchParams.get('produtoId') ?? 0)
        const destinatario = searchParams.get('destinatario') === 'contribuinte' ? 'contribuinte' : 'consumidor_final'
        if (!produtoId) return badRequest('Escolha o produto.')

        // Mesmo caminho que a emissão de verdade usa (FiscalService.criarNota
        // chama o mesmo método) — o simulador deixou de ter conta própria.
        const fiscal = await new FiscalService(db).resolverFiscalVenda({
          produtoId, ehParaContribuinte: destinatario === 'contribuinte', ufDestino,
        })
        if (!fiscal) return badRequest('Produto não encontrado.')
        if (fiscal.faltaPerfil) {
          return ok({
            tipoOperacao, produtoNome: (fiscal as any).produtoNome,
            faltaPerfil: destinatario === 'contribuinte'
              ? 'Este produto não tem perfil tributário de venda a contribuinte.'
              : 'Este produto não tem perfil tributário de venda a consumidor final.',
          })
        }

        return ok({
          tipoOperacao, mesmoEstado: fiscal.mesmoEstado, destinatario,
          produtoNome: fiscal.produtoNome, ncm: fiscal.ncm, cest: fiscal.cest,
          perfilNome:  fiscal.perfilNome,
          cfop:        fiscal.cfop,
          csosnOuCst:  fiscal.csosnOuCst,
          aliqIcms:    fiscal.aliqIcms,
          temSt:       fiscal.temSt,
          mva: fiscal.mva, aliqIcmsSt: fiscal.aliqIcmsSt, mvaPorEstado: fiscal.mvaPorEstado,
          cstPis:      fiscal.cstPis, aliqPis: fiscal.aliqPis,
          cstCofins:   fiscal.cstCofins, aliqCofins: fiscal.aliqCofins,
          cstIpi:      fiscal.cstIpi, aliqIpi: fiscal.aliqIpi,
        })
      }

      const cfgRes = await db.execute(sql`SELECT uf FROM t_configuracoes_tenant LIMIT 1`)
      const ufEmpresa   = String((cfgRes.rows[0] as any)?.uf ?? '').toUpperCase()
      const mesmoEstado = !!ufEmpresa && ufEmpresa === ufDestino

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
