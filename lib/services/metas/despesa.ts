// ESTE ARQUIVO VAI EM: lib/services/metas/despesa.ts
//
// Vivia dentro de app/api/[tenant]/metas/route.ts como export nomeado extra.
// Rota do App Router só pode exportar os handlers reconhecidos (GET, POST...)
// mais um pequeno allowlist de config — qualquer outro export nomeado quebra
// o type-check que o Next gera em .next/types, mesmo com @ts-nocheck no
// arquivo (o arquivo gerado é outro, o nocheck local não alcança ele).
import { sql } from 'drizzle-orm'

/**
 * Despesa real do mês = avulsas (t_despesa) + gastos fixos (t_gasto_fixo_valor).
 * Mesma conta que o Financeiro usa no KPI e no DRE — sem os gastos fixos
 * (aluguel, luz, salário), o número aqui ficava muito abaixo do real.
 */
export async function despesaDoMes(db: any, mes: number, ano: number): Promise<number> {
  const { total } = await despesaDoMesDetalhada(db, mes, ano)
  return total
}

/**
 * Mesmo total de despesaDoMes(), mas quebrado por origem — pra tela de Metas
 * explicar o que compõe o número em vez de jogar tudo debaixo de "Despesa".
 * Insumos vem do próprio categoria='Insumos' que Compras já grava em
 * t_despesa/t_conta_pagar (compra à vista ou baixa da compra a prazo) — não é
 * estimativa, é o valor real já rotulado na origem.
 */
export async function despesaDoMesDetalhada(db: any, mes: number, ano: number): Promise<{ insumos: number; operacionais: number; gastosFixos: number; total: number }> {
  const avulsaRes = await db.execute(sql`
    SELECT COALESCE(SUM(valor) FILTER (WHERE categoria = 'Insumos'), 0)::bigint as insumos,
           COALESCE(SUM(valor) FILTER (WHERE categoria IS DISTINCT FROM 'Insumos'), 0)::bigint as operacionais
      FROM t_despesa
     WHERE active_flg=true AND mes_competencia=${mes} AND ano_competencia=${ano}
  `)
  const fixoRes = await db.execute(sql`
    SELECT COALESCE(SUM(gv.valor),0)::bigint as total
      FROM t_gasto_fixo_valor gv
      JOIN t_gasto_fixo_categoria gc ON gc.categoria_id = gv.categoria_id AND gc.active_flg = true
     WHERE gv.active_flg = true AND gv.mes = ${mes} AND gv.ano = ${ano}
  `).catch(() => ({ rows: [{ total: 0 }] }))
  const insumos      = Number(avulsaRes.rows[0]?.insumos ?? 0)
  const operacionais  = Number(avulsaRes.rows[0]?.operacionais ?? 0)
  const gastosFixos   = Number(fixoRes.rows[0]?.total ?? 0)
  return { insumos, operacionais, gastosFixos, total: insumos + operacionais + gastosFixos }
}
