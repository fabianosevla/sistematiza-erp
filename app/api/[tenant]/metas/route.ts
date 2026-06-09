// @ts-nocheck
import type { NextRequest } from 'next/server'
import { eq, and, sql } from 'drizzle-orm'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { dbMeta } from '@/lib/db/schemas/metas'
import { ok, serverError } from '@/lib/api/responses'

type Params = { params: { tenant: string } }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const { searchParams } = new URL(req.url)
      const tipo = searchParams.get('tipo')
      const now  = new Date()
      const mes  = Number(searchParams.get('mes')  ?? now.getMonth() + 1)
      const ano  = Number(searchParams.get('ano')  ?? now.getFullYear())

      // Retorna meta + real do mês
      const [meta] = await db.select().from(dbMeta)
        .where(and(eq(dbMeta.mes, mes), eq(dbMeta.ano, ano), eq(dbMeta.activeFlag, true)))

      const [realReceita] = await db.execute(sql`
        SELECT COALESCE(SUM(total), 0)::bigint as receita FROM t_venda
        WHERE active_flg = true
          AND EXTRACT(MONTH FROM vendida_em) = ${mes}
          AND EXTRACT(YEAR  FROM vendida_em) = ${ano}
      `)
      const [realDespesa] = await db.execute(sql`
        SELECT COALESCE(SUM(valor), 0)::bigint as despesa FROM t_despesa
        WHERE active_flg = true
          AND mes_competencia = ${mes} AND ano_competencia = ${ano}
      `)

      const receita = Number((realReceita as any).receita ?? 0)
      const despesa = Number((realDespesa as any).despesa ?? 0)
      const lucro   = receita - despesa

      return ok({
        meta: meta ?? { metaReceita: 0, metaDespesaMaxima: 0, metaLucro: 0, mes, ano },
        real: { receita, despesa, lucro },
        progresso: {
          receita:  meta?.metaReceita       > 0 ? Math.min(100, (receita / meta.metaReceita)        * 100) : null,
          despesa:  meta?.metaDespesaMaxima > 0 ? Math.min(100, (despesa / meta.metaDespesaMaxima)   * 100) : null,
          lucro:    meta?.metaLucro         > 0 ? Math.min(100, (lucro   / meta.metaLucro)           * 100) : null,
        },
      })
    } finally { release() }
  } catch (err) { return serverError(err) }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const body = await req.json()
      const { mes, ano, metaReceita, metaDespesaMaxima, metaLucro } = body

      // Tipo simular — retorna projeção sem salvar
      if (body.tipo === 'simular') {
        const itens: { produtoId: number; quantidade: number }[] = body.itens ?? []

        let receitaProjetada = 0
        let custoInsumos     = 0

        for (const item of itens) {
          const [prod] = await db.execute(sql`
            SELECT preco_varejo FROM t_produto WHERE produto_id = ${item.produtoId} AND active_flg = true
          `)
          if (!prod) continue
          const preco = Number((prod as any).preco_varejo ?? 0)
          receitaProjetada += item.quantidade * preco

          // Custo via ficha técnica
          const ficha = await db.execute(sql`
            SELECT pi.quantidade, i.preco_custo
            FROM t_produto_insumo pi
            JOIN t_insumo i ON pi.insumo_id = i.insumo_id
            WHERE pi.produto_id = ${item.produtoId} AND pi.active_flg = true AND i.active_flg = true
          `)
          for (const fi of ficha.rows as any[]) {
            custoInsumos += parseFloat(fi.quantidade) * item.quantidade * Number(fi.preco_custo ?? 0)
          }
        }

        // Despesas fixas + variáveis do mês
        const mesSim = body.mes ?? new Date().getMonth() + 1
        const anoSim = body.ano ?? new Date().getFullYear()
        const [despesasMes] = await db.execute(sql`
          SELECT COALESCE(SUM(valor), 0)::bigint as total FROM t_despesa
          WHERE active_flg = true AND mes_competencia = ${mesSim} AND ano_competencia = ${anoSim}
        `)
        const [gastosFixos] = await db.execute(sql`
          SELECT COALESCE(SUM(valor), 0)::bigint as total FROM t_gasto_fixo_valor
          WHERE active_flg = true AND mes = ${mesSim} AND ano = ${anoSim}
        `)

        const despesasMesVal = Number((despesasMes as any).total ?? 0)
        const gastosFixosVal = Number((gastosFixos as any).total ?? 0)
        const totalDespesas  = despesasMesVal + gastosFixosVal
        const lucroBruto     = receitaProjetada - Math.round(custoInsumos)
        const lucroLiquido   = receitaProjetada - Math.round(custoInsumos) - totalDespesas

        // Meta do mês para comparação
        const [metaRow] = await db.select().from(dbMeta)
          .where(and(eq(dbMeta.mes, mesSim), eq(dbMeta.ano, anoSim), eq(dbMeta.activeFlag, true)))

        // Sugestões
        const sugestoes: string[] = []
        if (metaRow && receitaProjetada < metaRow.metaReceita) {
          const deficit = metaRow.metaReceita - receitaProjetada
          if (itens.length > 0) {
            const [mainProd] = await db.execute(sql`
              SELECT nome, preco_varejo FROM t_produto WHERE produto_id = ${itens[0].produtoId} AND active_flg = true
            `)
            if (mainProd) {
              const preco = Number((mainProd as any).preco_varejo ?? 1)
              const unidadesExtra = Math.ceil(deficit / preco)
              sugestoes.push(`Venda +${unidadesExtra} unidades de ${(mainProd as any).nome} para atingir a meta de receita`)
              const aumentoPct = (deficit / receitaProjetada * 100).toFixed(1)
              sugestoes.push(`Ou aumente o preço médio dos produtos em ${aumentoPct}% para compensar`)
            }
          }
        }
        if (metaRow && lucroLiquido < metaRow.metaLucro) {
          const deficitLucro = metaRow.metaLucro - lucroLiquido
          sugestoes.push(`Para atingir a meta de lucro, reduza despesas em ${(deficitLucro / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} ou aumente a receita`)
        }
        if (sugestoes.length === 0 && metaRow) {
          sugestoes.push('Projeção atingindo todas as metas. Ótimo planejamento!')
        }

        return ok({
          receitaProjetada,
          custoInsumos:    Math.round(custoInsumos),
          lucroBruto,
          despesasMes:     despesasMesVal,
          gastosFixos:     gastosFixosVal,
          totalDespesas,
          lucroLiquido,
          meta:            metaRow ?? null,
          sugestoes,
        })
      }

      // Salvar/atualizar meta
      const now = new Date()
      await db.execute(sql`
        INSERT INTO t_meta (mes, ano, meta_receita, meta_despesa_maxima, meta_lucro, created_by, updated_by)
        VALUES (${mes}, ${ano}, ${metaReceita ?? 0}, ${metaDespesaMaxima ?? 0}, ${metaLucro ?? 0}, 1, 1)
        ON CONFLICT (mes, ano)
        DO UPDATE SET
          meta_receita        = ${metaReceita ?? 0},
          meta_despesa_maxima = ${metaDespesaMaxima ?? 0},
          meta_lucro          = ${metaLucro ?? 0},
          updated_dt          = ${now.toISOString()}
      `)
      return ok({ ok: true })
    } finally { release() }
  } catch (err) { return serverError(err) }
}