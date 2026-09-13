// lib/services/crm/SegmentacaoService.ts
//
// Segmentação de cliente por comportamento de compra. CALCULADO NA LEITURA,
// sem tabela de configuração — limiar fixo abaixo, documentado. Só vira
// tela de configuração se algum tenant um dia pedir de verdade pra ajustar
// (nenhum pediu ainda — não é o momento de construir isso especulativamente).
import { sql } from 'drizzle-orm'
import type { AppDB } from '@/lib/db/connection'

// Dias desde a última compra que definem cada balde. Compra "recente" pra
// dentro do balde Novo também precisa ser a ÚNICA compra do cliente —
// senão um cliente antigo que comprou ontem cairia em "Novo" por engano.
const LIMITES = {
  ativoDias:    30,
  riscoDias:    60,
  sumindoDias: 120,
}

export type Balde = 'novo' | 'ativo' | 'em_risco' | 'sumindo' | 'inativo' | 'sem_compra'

export const BALDE_LABEL: Record<Balde, string> = {
  novo:       'Novo',
  ativo:      'Ativo',
  em_risco:   'Em risco',
  sumindo:    'Sumindo',
  inativo:    'Inativo',
  sem_compra: 'Sem compra',
}

export class SegmentacaoService {
  constructor(private db: AppDB) {}

  async resumo() {
    const r = await this.db.execute(sql`
      WITH stats AS (
        SELECT c.cliente_id, c.nome_completo, c.tipo_pessoa,
               COUNT(v.venda_id)::int AS qtd_compras,
               MAX(v.vendida_em) AS ultima_compra
          FROM t_cliente c
          LEFT JOIN t_venda v ON v.cliente_id = c.cliente_id AND v.active_flg = true
         WHERE c.active_flg = true
         GROUP BY c.cliente_id, c.nome_completo, c.tipo_pessoa
      )
      SELECT cliente_id, nome_completo, tipo_pessoa, qtd_compras, ultima_compra,
        CASE
          WHEN ultima_compra IS NULL THEN 'sem_compra'
          WHEN qtd_compras = 1 AND ultima_compra >= NOW() - (${LIMITES.ativoDias} * INTERVAL '1 day') THEN 'novo'
          WHEN ultima_compra >= NOW() - (${LIMITES.ativoDias} * INTERVAL '1 day') THEN 'ativo'
          WHEN ultima_compra >= NOW() - (${LIMITES.riscoDias} * INTERVAL '1 day') THEN 'em_risco'
          WHEN ultima_compra >= NOW() - (${LIMITES.sumindoDias} * INTERVAL '1 day') THEN 'sumindo'
          ELSE 'inativo'
        END AS balde
      FROM stats
      ORDER BY ultima_compra DESC NULLS LAST
    `)

    const linhas = (r.rows as any[]).map(row => ({
      clienteId: row.cliente_id, nome: row.nome_completo, tipoPessoa: row.tipo_pessoa,
      qtdCompras: row.qtd_compras, ultimaCompra: row.ultima_compra, balde: row.balde as Balde,
    }))

    const contagem: Record<Balde, number> = { novo: 0, ativo: 0, em_risco: 0, sumindo: 0, inativo: 0, sem_compra: 0 }
    for (const l of linhas) contagem[l.balde]++

    return { linhas, contagem }
  }
}
