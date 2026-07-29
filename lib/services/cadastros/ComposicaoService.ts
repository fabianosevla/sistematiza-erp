// @ts-nocheck
// lib/services/cadastros/ComposicaoService.ts
//
// Explosao da ficha tecnica (composicao total) para apoio a tabela nutricional.
//   insumo_id > 0  -> insumo puro (t_insumo)
//   insumo_id < 0  -> produto usado como insumo (t_produto, id = -insumo_id)
// Percorre recursivamente os produtos-insumo ate sobrar apenas insumo puro,
// converte unidades (kg/g, l/ml) e SOMA insumos que aparecem em mais de um
// caminho. Somente leitura: nao altera nada no banco.
import { sql } from 'drizzle-orm'
import { converterUnidade } from '@/lib/unidades'

const PROFUNDIDADE_MAX = 10

export class ComposicaoService {
  constructor(db) { this.db = db }

  async explodir(produtoId, multiplicador = 1) {
    // Carrega TODAS as fichas de uma vez e monta o indice em memoria.
    const res = await this.db.execute(sql`
      SELECT pi.produto_id, pi.insumo_id, pi.quantidade, pi.unidade,
             i.nome        AS insumo_nome,
             i.unidade     AS insumo_unidade,
             i.preco_custo AS insumo_preco_custo,
             p.nome        AS produto_nome,
             p.unidade     AS produto_unidade
      FROM t_produto_insumo pi
      LEFT JOIN t_insumo  i ON i.insumo_id = pi.insumo_id     AND pi.insumo_id > 0 AND i.active_flg = true
      LEFT JOIN t_produto p ON (-pi.insumo_id) = p.produto_id AND pi.insumo_id < 0 AND p.active_flg = true
      WHERE pi.active_flg = true
    `)

    const fichaPorProduto = {}
    for (const r of res.rows) {
      const pid = Number(r.produto_id)
      if (!fichaPorProduto[pid]) fichaPorProduto[pid] = []
      fichaPorProduto[pid].push(r)
    }

    const acumulado = {}
    const produtosExpandidos = []
    const emUso = new Set()
    let truncou = false

    const acumular = (r, qtd, origem) => {
      const id = Number(r.insumo_id)
      if (!acumulado[id]) {
        acumulado[id] = {
          insumoId:   id,
          nome:       r.insumo_nome,
          unidade:    r.insumo_unidade,
          quantidade: 0,
          precoCusto: Number(r.insumo_preco_custo ?? 0),
          custo:      0,
          origens:    [],
        }
      }
      acumulado[id].quantidade += qtd
      const jaTem = acumulado[id].origens.find(o => o.origem === origem)
      if (jaTem) jaTem.quantidade += qtd
      else acumulado[id].origens.push({ origem, quantidade: qtd })
    }

    const percorrer = (pid, mult, caminho, nivel) => {
      if (nivel > PROFUNDIDADE_MAX) { truncou = true; return }
      for (const r of fichaPorProduto[pid] ?? []) {
        const qtdFicha = parseFloat(String(r.quantidade ?? 0)) * mult
        if (!isFinite(qtdFicha) || qtdFicha <= 0) continue

        if (Number(r.insumo_id) > 0) {
          if (!r.insumo_nome) continue
          const qtd = converterUnidade(qtdFicha, r.unidade, r.insumo_unidade)
          acumular(r, qtd, caminho)
        } else {
          if (!r.produto_nome) continue
          const filhoId = -Number(r.insumo_id)
          if (emUso.has(filhoId)) { truncou = true; continue }
          const qtdFilho = converterUnidade(qtdFicha, r.unidade, r.produto_unidade)
          if (!produtosExpandidos.includes(r.produto_nome)) produtosExpandidos.push(r.produto_nome)
          emUso.add(filhoId)
          percorrer(filhoId, qtdFilho, caminho === 'Direto' ? r.produto_nome : caminho + ' > ' + r.produto_nome, nivel + 1)
          emUso.delete(filhoId)
        }
      }
    }

    emUso.add(produtoId)
    percorrer(produtoId, multiplicador, 'Direto', 0)

    const itens = Object.values(acumulado)
      .map(i => ({
        ...i,
        quantidade: Number(i.quantidade.toFixed(6)),
        custo:      Math.round(i.quantidade * i.precoCusto),
        origens:    i.origens.map(o => ({ ...o, quantidade: Number(o.quantidade.toFixed(6)) })),
      }))
      .sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'))

    return {
      itens,
      custoTotal: itens.reduce((a, i) => a + i.custo, 0),
      produtosExpandidos,
      multiplicador,
      truncou,
      totalFichasCarregadas: res.rows.length,
      componentesDiretos: (fichaPorProduto[produtoId] ?? []).length,
    }
  }
}
