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
    const [eventosRes, vendasRes] = await Promise.all([
      this.db.execute(sql`
        SELECT DATE(ocorrido_em AT TIME ZONE 'America/Sao_Paulo') AS dia,
               COUNT(*) FILTER (WHERE tipo = 'visualizacao')::int   AS visualizacoes,
               COUNT(*) FILTER (WHERE tipo = 'pedido_montado')::int AS pedidos_montados
          FROM t_cardapio_evento
         WHERE active_flg = true
           AND ocorrido_em >= NOW() - (${dias} * INTERVAL '1 day')
         GROUP BY DATE(ocorrido_em AT TIME ZONE 'America/Sao_Paulo')
         ORDER BY dia
      `),
      this.db.execute(sql`
        SELECT DATE(v.vendida_em AT TIME ZONE 'America/Sao_Paulo') AS dia,
               COUNT(DISTINCT v.venda_id)::int AS vendas_confirmadas
          FROM t_venda v
          LEFT JOIN t_pedido p ON p.venda_id = v.venda_id AND p.active_flg = true
         WHERE v.active_flg = true
           AND (v.origem_cardapio = true OR p.origem = 'cardapio')
           AND v.vendida_em >= NOW() - (${dias} * INTERVAL '1 day')
         GROUP BY DATE(v.vendida_em AT TIME ZONE 'America/Sao_Paulo')
      `),
    ])

    const vendasPorDia = new Map((vendasRes.rows as any[]).map(r => [String(r.dia), r.vendas_confirmadas]))

    return (eventosRes.rows as any[]).map(r => ({
      dia: r.dia,
      visualizacoes:    r.visualizacoes,
      pedidosMontados:  r.pedidos_montados,
      vendasConfirmadas: vendasPorDia.get(String(r.dia)) ?? 0,
    }))
  }
}
