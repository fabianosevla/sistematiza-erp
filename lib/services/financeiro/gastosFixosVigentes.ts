// ESTE ARQUIVO VAI EM: lib/services/financeiro/gastosFixosVigentes.ts
//
// GASTO FIXO REPETE PRA FRENTE.
//
// A tela de Gastos Fixos (GET /financeiro/gastos-fixos) mostra, em cada mês, o
// último valor lançado até ali: o aluguel lançado em julho aparece em agosto,
// setembro... sem ninguém copiar nada. Só que os DREs, o KPI do Financeiro, a
// consulta de Despesas e as Metas liam t_gasto_fixo_valor procurando o mês
// EXATO — mês herdado não tinha linha e o gasto fixo não era debitado.
//
// Esta é a mesma regra da tela, em SQL, para todo mundo que soma gasto fixo:
// para cada categoria e cada mês do intervalo, o lançamento mais recente com
// (ano, mês) <= ao mês. Lançar 0 num mês encerra a repetição dali pra frente.
import { sql } from 'drizzle-orm'

export interface IntervaloMeses { anoIni: number; mesIni: number; anoFim: number; mesFim: number }

/**
 * SELECT com uma linha por categoria × mês do intervalo, já com a herança
 * aplicada: (categoria_id, categoria, ordem, ano, mes, valor). Meses com valor
 * vigente 0 (ou sem lançamento anterior) ficam de fora.
 */
export function sqlGastosFixosVigentes({ anoIni, mesIni, anoFim, mesFim }: IntervaloMeses) {
  return sql`
    SELECT gc.categoria_id, gc.nome AS categoria, gc.ordem,
           EXTRACT(YEAR  FROM m.mes_ref)::int AS ano,
           EXTRACT(MONTH FROM m.mes_ref)::int AS mes,
           v.valor
      FROM GENERATE_SERIES(
             MAKE_DATE(${anoIni}::int, ${mesIni}::int, 1),
             MAKE_DATE(${anoFim}::int, ${mesFim}::int, 1),
             INTERVAL '1 month'
           ) AS m(mes_ref)
      CROSS JOIN t_gasto_fixo_categoria gc
      JOIN LATERAL (
        SELECT gv.valor
          FROM t_gasto_fixo_valor gv
         WHERE gv.categoria_id = gc.categoria_id
           AND gv.active_flg = true
           AND gv.ano * 12 + gv.mes <= EXTRACT(YEAR FROM m.mes_ref)::int * 12 + EXTRACT(MONTH FROM m.mes_ref)::int
         ORDER BY gv.ano DESC, gv.mes DESC
         LIMIT 1
      ) v ON true
     WHERE gc.active_flg = true
       AND v.valor > 0
  `
}

/** Um mês só. */
export function mesUnico(mes: number, ano: number): IntervaloMeses {
  return { anoIni: ano, mesIni: mes, anoFim: ano, mesFim: mes }
}

/**
 * Meses cujo dia 1º cai dentro de [inicio, fim] — a convenção das Consultas:
 * o gasto fixo do mês conta como lançado no dia 1º. Consultar 3 a 5 de agosto
 * não traz o aluguel de agosto; consultar agosto inteiro traz. Devolve null
 * quando nenhum dia 1º cai no intervalo.
 */
export function mesesComDia1(inicio: Date, fim: Date): IntervaloMeses | null {
  let anoIni = inicio.getFullYear()
  let mesIni = inicio.getMonth() + 1
  if (inicio.getDate() !== 1 || inicio.getHours() !== 0 || inicio.getMinutes() !== 0) {
    mesIni += 1
    if (mesIni > 12) { mesIni = 1; anoIni += 1 }
  }
  let anoFim = fim.getFullYear()
  let mesFim = fim.getMonth() + 1
  // Consulta sem data vem de 1970 a 2999: limita para não gerar milhares de
  // meses vazios na série.
  if (anoIni < 2000) { anoIni = 2000; mesIni = 1 }
  const anoTeto = new Date().getFullYear() + 2
  if (anoFim > anoTeto) { anoFim = anoTeto; mesFim = 12 }
  if (anoIni * 12 + mesIni > anoFim * 12 + mesFim) return null
  return { anoIni, mesIni, anoFim, mesFim }
}
