// lib/services/crm/SegmentacaoService.ts
//
// Segmentação de cliente por comportamento de compra. CALCULADO NA LEITURA,
// sem tabela de cliente-por-balde pra manter — só os 3 limiares de dias são
// configuráveis, em t_configuracoes_tenant (segmentacao_dias_ativo/
// em_risco/sumindo — ver scripts/migrate-segmentacao-config.js). Até
// 15/09/2026 eram fixos no código; virou pedido explícito do Fabiano depois
// que o tooltip com os números fixos ficou contraditório com uma tela de
// configuração que ele queria construir.
import { sql } from 'drizzle-orm'
import type { AppDB } from '@/lib/db/connection'

// Mesmos valores que eram fixos antes — servem só de fallback caso a
// linha de configuração não tenha as colunas preenchidas por algum motivo
// (não deveria acontecer, a migração cobre todo tenant existente). A tela
// nunca deve quebrar por falta dessa config.
const LIMITES_PADRAO = {
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

export interface LimiaresSegmentacao {
  ativoDias:    number
  riscoDias:    number
  sumindoDias:  number
}

export class SegmentacaoService {
  constructor(private db: AppDB) {}

  /** Limiares configurados pelo tenant, com fallback pros valores que eram fixos antes. */
  async getLimiares(): Promise<LimiaresSegmentacao> {
    const r = await this.db.execute(sql`
      SELECT segmentacao_dias_ativo, segmentacao_dias_em_risco, segmentacao_dias_sumindo
        FROM t_configuracoes_tenant LIMIT 1
    `)
    const row = (r.rows as any[])[0]
    return {
      ativoDias:   Number(row?.segmentacao_dias_ativo    ?? LIMITES_PADRAO.ativoDias),
      riscoDias:   Number(row?.segmentacao_dias_em_risco ?? LIMITES_PADRAO.riscoDias),
      sumindoDias: Number(row?.segmentacao_dias_sumindo  ?? LIMITES_PADRAO.sumindoDias),
    }
  }

  /**
   * Grava os 3 limiares. Validação de ordem (ativoDias < riscoDias < sumindoDias)
   * é responsabilidade de quem chama (a rota) — aqui só grava.
   */
  async salvarLimiares(limiares: LimiaresSegmentacao): Promise<void> {
    await this.db.execute(sql`
      UPDATE t_configuracoes_tenant SET
        segmentacao_dias_ativo    = ${limiares.ativoDias},
        segmentacao_dias_em_risco = ${limiares.riscoDias},
        segmentacao_dias_sumindo  = ${limiares.sumindoDias}
    `)
  }

  async resumo() {
    const limites = await this.getLimiares()

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
          WHEN qtd_compras = 1 AND ultima_compra >= NOW() - (${limites.ativoDias} * INTERVAL '1 day') THEN 'novo'
          WHEN ultima_compra >= NOW() - (${limites.ativoDias} * INTERVAL '1 day') THEN 'ativo'
          WHEN ultima_compra >= NOW() - (${limites.riscoDias} * INTERVAL '1 day') THEN 'em_risco'
          WHEN ultima_compra >= NOW() - (${limites.sumindoDias} * INTERVAL '1 day') THEN 'sumindo'
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

    return { linhas, contagem, limites }
  }
}
