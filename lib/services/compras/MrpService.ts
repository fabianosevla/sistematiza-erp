import { sql } from 'drizzle-orm'
import type { AppDB } from '@/lib/db/connection'
import { dbListaCompra, dbListaCompraItem } from '@/lib/db/schemas/compras-completo'

/**
 * MrpService — Análise de Necessidade de Compra.
 *
 * Cruza, para cada insumo:
 *   estoque atual + pedidos já em aberto (chegando)
 *   vs
 *   estoque mínimo + requisições pendentes + consumo projetado da produção
 *   planejada (via ficha técnica em t_produto_insumo)
 *
 * Sugestão de compra = max(0, necessário - disponível)
 */
export class MrpService {
  constructor(private db: AppDB) {}

  async analisar({ diasProjecao = 30, mostrarApenasAbaixoMinimo = false }: {
    diasProjecao?: number
    mostrarApenasAbaixoMinimo?: boolean
  } = {}) {
    const hoje = new Date()
    const fimProjecao = new Date(hoje)
    fimProjecao.setDate(hoje.getDate() + diasProjecao)
    const hojeStr = hoje.toISOString().slice(0, 10)
    const fimStr  = fimProjecao.toISOString().slice(0, 10)

    // 1. Todos os insumos ativos
    const insumosRes = await this.db.execute(sql`
      SELECT insumo_id, nome, unidade, estoque_atual, estoque_minimo, preco_custo
      FROM t_insumo WHERE active_flg = true ORDER BY nome
    `)

    // 2. Requisições pendentes por insumo
    const reqRes = await this.db.execute(sql`
      SELECT ri.insumo_id, COALESCE(SUM(ri.quantidade), 0) as total
      FROM t_requisicao_item ri
      JOIN t_requisicao_material r ON ri.requisicao_id = r.requisicao_id
      WHERE ri.active_flg = true AND r.active_flg = true AND r.status = 'pendente'
      GROUP BY ri.insumo_id
    `)

    // 3. Pedidos de compra já em aberto (chegando) por insumo
    const pedidosAbertosRes = await this.db.execute(sql`
      SELECT pi.insumo_id, COALESCE(SUM(pi.quantidade - pi.quantidade_recebida), 0) as total
      FROM t_pedido_compra_item pi
      JOIN t_pedido_compra p ON pi.pedido_id = p.pedido_id
      WHERE pi.active_flg = true AND p.active_flg = true AND p.status IN ('aberto', 'recebido_parcial')
      GROUP BY pi.insumo_id
    `)

    // 4. Consumo projetado: produção planejada (próximos N dias) × ficha técnica
    const consumoRes = await this.db.execute(sql`
      SELECT pti.insumo_id,
             COALESCE(SUM(pti.quantidade * ps.quantidade), 0) as total
      FROM t_producao_semanal ps
      JOIN t_produto_insumo pti ON pti.produto_id = ps.produto_id AND pti.active_flg = true
      WHERE ps.active_flg = true
        AND ps.data_producao >= ${hojeStr} AND ps.data_producao <= ${fimStr}
      GROUP BY pti.insumo_id
    `)

    const reqMap      = Object.fromEntries((reqRes.rows as any[]).map(r => [r.insumo_id, Number(r.total)]))
    const pedidosMap  = Object.fromEntries((pedidosAbertosRes.rows as any[]).map(r => [r.insumo_id, Number(r.total)]))
    const consumoMap  = Object.fromEntries((consumoRes.rows as any[]).map(r => [r.insumo_id, Number(r.total)]))

    let itens = (insumosRes.rows as any[]).map(ins => {
      const estoqueAtual    = Number(ins.estoque_atual)
      const estoqueMinimo   = Number(ins.estoque_minimo)
      const qtdRequisicao   = reqMap[ins.insumo_id] ?? 0
      const consumoProjetado = consumoMap[ins.insumo_id] ?? 0
      const pedidosEmAberto  = pedidosMap[ins.insumo_id] ?? 0

      const necessario  = estoqueMinimo + qtdRequisicao + consumoProjetado
      const disponivel  = estoqueAtual + pedidosEmAberto
      const sugestao    = Math.max(0, necessario - disponivel)

      return {
        insumoId:        ins.insumo_id,
        nome:            ins.nome,
        unidade:         ins.unidade,
        estoqueAtual,
        estoqueMinimo,
        qtdRequisicao,
        consumoProjetado,
        pedidosEmAberto,
        sugestaoCompra:  sugestao,
        precoCusto:      Number(ins.preco_custo ?? 0),
        valorEstimado:   sugestao * Number(ins.preco_custo ?? 0),
        abaixoMinimo:    estoqueAtual <= estoqueMinimo,
      }
    })

    if (mostrarApenasAbaixoMinimo) {
      itens = itens.filter(i => i.abaixoMinimo || i.sugestaoCompra > 0)
    } else {
      itens = itens.filter(i => i.sugestaoCompra > 0)
    }

    itens.sort((a, b) => b.sugestaoCompra - a.sugestaoCompra)

    return {
      itens,
      diasProjecao,
      totalItens:    itens.length,
      valorEstimado: itens.reduce((a, i) => a + i.valorEstimado, 0),
    }
  }

  /** Gera uma Lista de Compras a partir do resultado do MRP */
  async gerarLista(itens: { insumoId: number; nomeInsumo: string; quantidadeSugerida: number; estoqueNoMomento: number }[], userId: number, descricao?: string) {
    const now = new Date()
    const [lista] = await this.db.insert(dbListaCompra).values({
      descricao:    descricao ?? `Lista gerada via MRP — ${now.toLocaleDateString('pt-BR')}`,
      dataGeracao:  now.toISOString().slice(0, 10),
      origem:       'mrp',
      status:       'aberta',
      createdBy: userId, updatedBy: userId, createdDt: now, updatedDt: now,
    }).returning({ listaId: dbListaCompra.listaId })

    for (const item of itens) {
      await this.db.insert(dbListaCompraItem).values({
        listaId:            lista.listaId,
        insumoId:           item.insumoId,
        nomeInsumo:         item.nomeInsumo,
        quantidadeSugerida: String(item.quantidadeSugerida),
        estoqueNoMomento:   String(item.estoqueNoMomento),
        createdBy: userId, updatedBy: userId, createdDt: now, updatedDt: now,
      })
    }
    return lista
  }
}