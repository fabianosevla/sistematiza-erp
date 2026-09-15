// lib/services/crm/CardapioAnaliticaService.ts
//
// Funil do cardápio digital: visualização → pedido montado (WhatsApp) →
// venda confirmada. Os dois primeiros vêm de t_cardapio_evento; o terceiro
// vem de t_venda, por dois caminhos possíveis — não tem como saber com
// certeza além disso (ver comentário em app/api/[tenant]/cardapio/mensagem/
// route.ts: o pedido vira mensagem de WhatsApp, a venda é lançada à mão
// depois, sem vínculo automático — por isso a origem precisa ser marcada
// manualmente ao registrar):
//   1. Pela tela de Pedidos, com origem 'cardapio' — a venda nasce na
//      entrega (t_pedido.venda_id) e carrega t_venda.origem_cardapio junto.
//   2. Direto no PDV, marcando "Pedido via cardápio digital" no balcão —
//      t_venda.origem_cardapio fica true sem nunca existir um t_pedido.
import { sql } from 'drizzle-orm'
import type { AppDB } from '@/lib/db/connection'

export class CardapioAnaliticaService {
  constructor(private db: AppDB) {}

  async funilDiario(dias = 14) {
    // BUG CORRIGIDO (15/09/2026), em duas camadas:
    //
    // 1. O resultado vinha de um .map() em cima das linhas de
    //    t_cardapio_evento — só aparecia dia com pelo menos 1 evento. Hoje,
    //    sem nenhuma visualização ainda registrada, sumia da lista. Mesma
    //    classe de bug já corrigida em
    //    app/api/[tenant]/dashboard/vendas-serie/route.ts (gráfico
    //    "Diário"): gera a base de dias com generate_series e LEFT JOIN por
    //    cima, garantindo uma linha por dia do intervalo, hoje incluso, com
    //    zero onde não tem movimento.
    //
    // 2. A primeira tentativa de corrigir usou `CURRENT_DATE AT TIME ZONE
    //    'America/Sao_Paulo'` pra achar "hoje" — testado direto contra o
    //    banco, essa expressão erra o dia (devolve 14/09 21h em vez de
    //    15/09, porque `CURRENT_DATE` primeiro vira timestamptz na meia-noite
    //    UTC da sessão, e SÓ DEPOIS `AT TIME ZONE` desloca esse instante pra
    //    São Paulo — a direção errada). A forma certa de achar "hoje em SP" é
    //    `(NOW() AT TIME ZONE 'America/Sao_Paulo')::date`: NOW() já é um
    //    instante de verdade (timestamptz), `AT TIME ZONE` mostra a que horas
    //    isso corresponde em SP, e só então extrai a data.
    const res = await this.db.execute(sql`
      WITH baldes AS (
        SELECT generate_series(
          (((NOW() AT TIME ZONE 'America/Sao_Paulo')::date - ${dias - 1}))::timestamp,
          ((NOW() AT TIME ZONE 'America/Sao_Paulo')::date)::timestamp,
          INTERVAL '1 day'
        )::date AS dia
      ),
      eventos AS (
        SELECT DATE(ocorrido_em AT TIME ZONE 'America/Sao_Paulo') AS dia,
               COUNT(*) FILTER (WHERE tipo = 'visualizacao')::int   AS visualizacoes,
               COUNT(*) FILTER (WHERE tipo = 'pedido_montado')::int AS pedidos_montados
          FROM t_cardapio_evento
         WHERE active_flg = true
           AND ocorrido_em >= NOW() - (${dias} * INTERVAL '1 day')
         GROUP BY DATE(ocorrido_em AT TIME ZONE 'America/Sao_Paulo')
      ),
      vendas AS (
        SELECT DATE(v.vendida_em AT TIME ZONE 'America/Sao_Paulo') AS dia,
               COUNT(DISTINCT v.venda_id)::int AS vendas_confirmadas
          FROM t_venda v
          LEFT JOIN t_pedido p ON p.venda_id = v.venda_id AND p.active_flg = true
         WHERE v.active_flg = true
           AND (v.origem_cardapio = true OR p.origem = 'cardapio')
           AND v.vendida_em >= NOW() - (${dias} * INTERVAL '1 day')
         GROUP BY DATE(v.vendida_em AT TIME ZONE 'America/Sao_Paulo')
      )
      SELECT b.dia,
             COALESCE(e.visualizacoes, 0)::int    AS visualizacoes,
             COALESCE(e.pedidos_montados, 0)::int AS pedidos_montados,
             COALESCE(v.vendas_confirmadas, 0)::int AS vendas_confirmadas
        FROM baldes b
        LEFT JOIN eventos e ON e.dia = b.dia
        LEFT JOIN vendas  v ON v.dia = b.dia
       ORDER BY b.dia
    `)

    return (res.rows as any[]).map(r => ({
      dia: r.dia,
      visualizacoes:     r.visualizacoes,
      pedidosMontados:   r.pedidos_montados,
      vendasConfirmadas: r.vendas_confirmadas,
    }))
  }
}
