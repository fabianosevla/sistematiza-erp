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
        .debitar(produtoId, previa.baseUsada, userId, `Consumo pela produção de ${dataProducao}`)

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

  /**
   * REGISTRO EM LOTE — o botão "Registrar Produção" da grade.
   *
   * Recebe as células pendentes (produto + data + quantidade) e grava todas
   * numa transação só. Ou tudo entra, ou nada entra: não existe cenário em que
   * metade dos produtos baixou insumo e a outra metade não.
   *
   * A quantidade da célula É a quantidade produzida. Se saíram 52 rondelis
   * onde o plano dizia 50, a pessoa corrige a célula para 52 antes de
   * registrar — por isso planejada e produzida são o mesmo número aqui.
   */
  async registrarLote({ itens, observacao, userId }: {
    itens: { produtoId: number; dataProducao: string; quantidade: number }[]
    observacao?: string
    userId: number
  }) {
    const validos = (itens ?? []).filter(i => Number(i.quantidade) > 0 && Number(i.produtoId) > 0)
    if (validos.length === 0) throw new Error('Nenhuma célula com quantidade para registrar')

    // Confere as fichas antes de abrir transação — erro de cadastro não deve
    // derrubar a gravação no meio.
    const semFicha: string[] = []
    for (const item of validos) {
      const previa = await this.simular({
        produtoId:    Number(item.produtoId),
        qtdPlanejada: Number(item.quantidade),
        qtdProduzida: Number(item.quantidade),
      })
      if (!previa.temFicha) semFicha.push(previa.nomeProduto)
    }
    if (semFicha.length > 0) {
      throw new Error(`Sem ficha técnica: ${[...new Set(semFicha)].join(', ')}. Cadastre a ficha antes de registrar.`)
    }

    const debito = new DebitoInsumoService(this.db, this.schemaName)
    const gravados: any[] = []

    await this.db.execute(sql`BEGIN`)
    try {
      for (const item of validos) {
        const produtoId = Number(item.produtoId)
        const qtd       = Number(item.quantidade)
        const data      = String(item.dataProducao)

        const itensDebitados = await debito.simular(produtoId, qtd)
        await debito.debitar(produtoId, qtd, userId, `Consumo pela produção de ${data}`)

        await this.db.execute(sql`
          UPDATE t_produto
          SET estoque_atual = estoque_atual + ${qtd},
              updated_dt = NOW(), updated_by = ${userId}
          WHERE produto_id = ${produtoId}
        `)

        await this.db.execute(sql`
          INSERT INTO t_movimentacao_estoque
            (tipo, entidade, entidade_id, quantidade, preco_custo, observacao,
             data_movimentacao, created_by, updated_by, created_dt, updated_dt, active_flg, modification_num)
          VALUES
            ('entrada', 'produto', ${produtoId}, ${qtd}, 0,
             ${observacao ?? `Produção de ${data}`},
             NOW(), ${userId}, ${userId}, NOW(), NOW(), true, 0)
        `)

        const reg = await this.db.execute(sql`
          INSERT INTO t_producao_registro
            (produto_id, data_producao, qtd_planejada, qtd_produzida, base_consumo,
             itens_json, observacao, created_by, updated_by)
          VALUES
            (${produtoId}, ${data}::date, ${qtd}, ${qtd}, 'planejada',
             ${JSON.stringify(itensDebitados)}::jsonb, ${observacao ?? null}, ${userId}, ${userId})
          RETURNING registro_id
        `)

        gravados.push({
          produtoId,
          dataProducao: data,
          quantidade:   qtd,
          registroId:   (reg.rows as any[])[0]?.registro_id,
          insuficiencia: itensDebitados.some((i: any) => i.insuficiente),
        })
      }

      await this.db.execute(sql`COMMIT`)
    } catch (err) {
      await this.db.execute(sql`ROLLBACK`)
      throw err
    }

    const comFalta = gravados.filter(g => g.insuficiencia).length
    return {
      registrado: true,
      total: gravados.length,
      gravados,
      message: `${gravados.length} registro(s) de produção lançado(s).` +
        (comFalta > 0 ? ` ${comFalta} com insumo insuficiente — o estoque desses insumos ficou zerado.` : ''),
    }
  }

  /**
   * Prévia do lote: soma o consumo de insumo de todas as células juntas, para
   * a tela mostrar o que vai sair da prateleira antes de confirmar.
   */
  async simularLote(itens: { produtoId: number; dataProducao: string; quantidade: number }[]) {
    const validos = (itens ?? []).filter(i => Number(i.quantidade) > 0)
    const debito  = new DebitoInsumoService(this.db, this.schemaName)

    const consumo: Record<number, any> = {}
    const produtos: any[] = []

    for (const item of validos) {
      const produtoId = Number(item.produtoId)
      const qtd       = Number(item.quantidade)
      const linhas    = await debito.simular(produtoId, qtd)

      const prod = await this.db.execute(sql`
        SELECT nome, unidade FROM t_produto WHERE produto_id = ${produtoId}
      `)
      const p = (prod.rows as any[])[0] ?? {}

      produtos.push({
        produtoId,
        nome:         p.nome ?? `#${produtoId}`,
        unidade:      p.unidade ?? 'un',
        dataProducao: item.dataProducao,
        quantidade:   qtd,
        temFicha:     linhas.length > 0,
      })

      for (const l of linhas) {
        const key = Number(l.insumoId)
        if (!consumo[key]) {
          consumo[key] = {
            insumoId:     key,
            ehProduto:    l.ehProduto,
            nome:         l.nome,
            unidade:      l.unidadeEstoque,
            estoqueAtual: l.estoqueAtual,
            total:        0,
          }
        }
        consumo[key].total += l.qtdTotalDebitar
      }
    }

    const insumos = Object.values(consumo).map((c: any) => ({
      ...c,
      restante:   c.estoqueAtual - c.total,
      suficiente: c.estoqueAtual >= c.total,
    })).sort((a: any, b: any) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'))

    return {
      produtos,
      insumos,
      totalProdutos:  produtos.length,
      semFicha:       produtos.filter(p => !p.temFicha).map(p => p.nome),
      temInsuficiencia: insumos.some((i: any) => !i.suficiente),
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