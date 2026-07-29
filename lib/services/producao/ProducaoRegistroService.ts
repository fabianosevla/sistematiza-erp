// @ts-nocheck
// lib/services/producao/ProducaoRegistroService.ts
//
// REGISTRO DE PRODUÇÃO — fecha o ciclo numa operação só.
//
// Antes existiam duas metades da mesma coisa:
//   Estoque → Produto Acabado → Adicionar : somava no produto E debitava insumo
//   Produção → Registrar Produção         : debitava insumo, NÃO somava
//
// Aqui as duas viram uma. E o débito passa a usar o mesmo DebitoInsumoService
// que o Estoque já usa — uma regra só, num lugar só.
//
// RENDIMENTO
// Você planeja 50 rondelis e saem 52. As duas quantidades são diferentes e
// ambas importam:
//   - o insumo é debitado pela quantidade PLANEJADA, porque foi ela que saiu
//     da prateleira;
//   - o estoque do produto sobe pela quantidade PRODUZIDA.
// A diferença vira rendimento (52/50 = 104%), que com o tempo mostra se a
// ficha técnica está desatualizada.
//
// `baseConsumo: 'produzida'` inverte a regra, caso você mude de ideia — mas o
// valor usado fica gravado em cada registro, então o histórico nunca fica
// ambíguo sobre qual regra valia na época.
import { sql } from 'drizzle-orm'
import type { AppDB } from '@/lib/db/connection'
import { DebitoInsumoService } from '@/lib/services/estoque/DebitoInsumoService'

export class ProducaoRegistroService {
  constructor(private db: AppDB, private schemaName: string) {}

  /** Prévia: o que será consumido e o que entra, sem gravar nada. */
  async simular({ produtoId, qtdPlanejada, qtdProduzida, baseConsumo = 'planejada' }: {
    produtoId:    number
    qtdPlanejada: number
    qtdProduzida: number
    baseConsumo?: 'planejada' | 'produzida'
  }) {
    const base = baseConsumo === 'produzida' ? qtdProduzida : qtdPlanejada
    const itens = await new DebitoInsumoService(this.db, this.schemaName).simular(produtoId, base)

    const prod = await this.db.execute(sql`
      SELECT nome, unidade, estoque_atual FROM t_produto WHERE produto_id = ${produtoId}
    `)
    const p = (prod.rows as any[])[0] ?? {}

    return {
      temFicha:       itens.length > 0,
      produtoId,
      nomeProduto:    p.nome ?? `#${produtoId}`,
      unidade:        p.unidade ?? 'un',
      estoqueAtual:   Number(p.estoque_atual ?? 0),
      estoqueDepois:  Number(p.estoque_atual ?? 0) + qtdProduzida,
      qtdPlanejada,
      qtdProduzida,
      baseConsumo,
      baseUsada:      base,
      rendimento:     qtdPlanejada > 0 ? (qtdProduzida / qtdPlanejada) * 100 : null,
      itens,
      temInsuficiencia: itens.some((i: any) => i.insuficiente),
    }
  }

  /**
   * Executa. Numa transação só: debita insumo, soma no produto, grava a
   * movimentação e o registro de produção. Se qualquer passo falhar, nada é
   * gravado — não existe meio-caminho em que o insumo baixou e o produto não
   * subiu.
   */
  async registrar({ produtoId, dataProducao, qtdPlanejada, qtdProduzida, baseConsumo = 'planejada', observacao, userId }: {
    produtoId:    number
    dataProducao: string
    qtdPlanejada: number
    qtdProduzida: number
    baseConsumo?: 'planejada' | 'produzida'
    observacao?:  string
    userId:       number
  }) {
    if (!(qtdProduzida > 0)) throw new Error('Quantidade produzida deve ser maior que zero')

    const previa = await this.simular({ produtoId, qtdPlanejada, qtdProduzida, baseConsumo })
    if (!previa.temFicha) {
      throw new Error('Produto sem ficha técnica. Cadastre a ficha antes de registrar produção.')
    }

    await this.db.execute(sql`BEGIN`)
    try {
      // 1. Debita os insumos pela base escolhida
      await new DebitoInsumoService(this.db, this.schemaName)
        .debitar(produtoId, previa.baseUsada, userId)

      // 2. Soma o produzido no estoque do produto
      await this.db.execute(sql`
        UPDATE t_produto
        SET estoque_atual = estoque_atual + ${qtdProduzida},
            updated_dt = NOW(), updated_by = ${userId}
        WHERE produto_id = ${produtoId}
      `)

      // 3. Movimentação de estoque — o extrato do produto
      await this.db.execute(sql`
        INSERT INTO t_movimentacao_estoque
          (tipo, entidade, entidade_id, quantidade, preco_custo, observacao,
           data_movimentacao, created_by, updated_by, created_dt, updated_dt, active_flg, modification_num)
        VALUES
          ('entrada', 'produto', ${produtoId}, ${qtdProduzida}, 0,
           ${observacao ?? `Produção de ${dataProducao}`},
           NOW(), ${userId}, ${userId}, NOW(), NOW(), true, 0)
      `)

      // 4. Registro de produção — plano × realizado
      const reg = await this.db.execute(sql`
        INSERT INTO t_producao_registro
          (produto_id, data_producao, qtd_planejada, qtd_produzida, base_consumo,
           itens_json, observacao, created_by, updated_by)
        VALUES
          (${produtoId}, ${dataProducao}::date, ${qtdPlanejada}, ${qtdProduzida}, ${baseConsumo},
           ${JSON.stringify(previa.itens)}::jsonb, ${observacao ?? null}, ${userId}, ${userId})
        RETURNING registro_id
      `)

      await this.db.execute(sql`COMMIT`)

      return {
        ...previa,
        registrado: true,
        registroId: (reg.rows as any[])[0]?.registro_id,
        message: `Produção registrada: ${qtdProduzida} ${previa.unidade} de ${previa.nomeProduto} no estoque, insumos debitados por ${previa.baseUsada}.`,
      }
    } catch (err) {
      await this.db.execute(sql`ROLLBACK`)
      throw err
    }
  }

  /** Registros de uma semana, para a grade marcar as células realizadas. */
  async listarPorPeriodo(dataInicio: string, dataFim: string) {
    const res = await this.db.execute(sql`
      SELECT registro_id, produto_id, data_producao::text AS data_producao,
             qtd_planejada, qtd_produzida, base_consumo, created_dt
      FROM t_producao_registro
      WHERE active_flg = true
        AND data_producao >= ${dataInicio}::date
        AND data_producao <= ${dataFim}::date
      ORDER BY data_producao, produto_id
    `)

    const porProdutoData: Record<number, Record<string, any>> = {}
    for (const r of res.rows as any[]) {
      const pid  = Number(r.produto_id)
      const data = String(r.data_producao).slice(0, 10)
      const planejada = Number(r.qtd_planejada)
      const produzida = Number(r.qtd_produzida)
      const atual = (porProdutoData[pid] ??= {})[data]
      // Mais de um registro no mesmo dia soma
      porProdutoData[pid][data] = {
        registroId: r.registro_id,
        planejada:  (atual?.planejada ?? 0) + planejada,
        produzida:  (atual?.produzida ?? 0) + produzida,
        rendimento: null,
      }
      const acc = porProdutoData[pid][data]
      acc.rendimento = acc.planejada > 0 ? (acc.produzida / acc.planejada) * 100 : null
    }

    return { registros: res.rows, porProdutoData }
  }
}