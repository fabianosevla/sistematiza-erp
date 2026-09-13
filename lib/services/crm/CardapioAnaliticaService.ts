// lib/services/crm/CardapioAnaliticaService.ts
//
// Funil do cardápio digital: visualização → pedido montado (WhatsApp) →
// venda confirmada. Os dois primeiros vêm de t_cardapio_evento; o terceiro
// vem de t_pedido.origem = 'cardapio' já faturado (venda_id preenchido) —
// não tem como saber com certeza além disso (ver comentário em
// app/api/[tenant]/cardapio/mensagem/route.ts: o pedido vira mensagem de
// WhatsApp, a venda é lançada à mão depois, sem vínculo automático — por
// isso a origem precisa ser marcada manualmente ao registrar o pedido).
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
        SELECT DATE(p.data_pedido AT TIME ZONE 'America/Sao_Paulo') AS dia,
               COUNT(*)::int AS vendas_confirmadas
          FROM t_pedido p
         WHERE p.active_flg = true AND p.origem = 'cardapio' AND p.venda_id IS NOT NULL
           AND p.data_pedido >= NOW() - (${dias} * INTERVAL '1 day')
         GROUP BY DATE(p.data_pedido AT TIME ZONE 'America/Sao_Paulo')
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
