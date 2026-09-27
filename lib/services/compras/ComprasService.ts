import { sql } from 'drizzle-orm'
import type { AppDB } from '@/lib/db/connection'

/**
 * COMPRAS.
 *
 * O módulo tinha seis abas — cotação, requisição, pedido de compra,
 * conferência, listas e MRP. É o fluxo de uma indústria com departamento de
 * suprimentos; numa fábrica com dois operadores virava formulário que ninguém
 * preenche. Sobrou uma tela: registrar a compra.
 *
 * O que veio junto do que foi removido: a SUGESTÃO DE COMPRA do antigo MRP.
 * Sem ela a tela é uma folha em branco e o operador precisa saber de cabeça o
 * que está faltando.
 *
 * ── O QUE UMA COMPRA DISPARA ────────────────────────────────────────────────
 *
 *   1. t_compra / t_compra_item     o documento em si
 *   2. t_insumo.estoque_atual       o saldo sobe
 *   3. t_movimentacao_estoque       o extrato ganha a linha (aparece em
 *                                   Consultas → Entradas)
 *   4. t_insumo.preco_custo         passa a valer o preço pago de verdade
 *   5. t_despesa OU t_conta_pagar   à vista vira gasto na data; a prazo vira
 *                                   conta com vencimento
 *
 * O item 4 conserta um problema silencioso: a margem da ficha técnica usava o
 * custo digitado no cadastro, que envelhecia sem ninguém perceber.
 *
 * Tudo numa transação. Estoque que sobe sem a despesa correspondente é pior
 * que compra não registrada — some do caixa e ninguém procura.
 */
export class ComprasService {
  constructor(private db: AppDB) {}

  // ── SUGESTÃO DE COMPRA ────────────────────────────────────────────────────
  //
  //   necessário = estoque mínimo + consumo previsto da produção agendada
  //   sugestão   = max(0, necessário - estoque atual)
  //
  // `ultimoPreco` vem da última compra registrada; sem compra anterior cai no
  // preco_custo do cadastro, e a tela marca que o valor é estimativa.
  async sugestoes({ diasProjecao = 30 }: { diasProjecao?: number } = {}) {
    const hoje = new Date()
    const fim  = new Date(hoje)
    fim.setDate(hoje.getDate() + diasProjecao)
    const hojeStr = hoje.toISOString().slice(0, 10)
    const fimStr  = fim.toISOString().slice(0, 10)

    const res = await this.db.execute(sql`
      WITH consumo AS (
        SELECT pi.insumo_id,
               SUM(pi.quantidade * ps.quantidade)::numeric AS previsto
        FROM t_producao_semanal ps
        -- pi.active_flg: insumo retirado da ficha técnica é inativado, não
        -- apagado. Sem o filtro, a sugestão de compra continuaria pedindo um
        -- ingrediente que a receita não usa mais.
        JOIN t_produto_insumo pi ON pi.produto_id = ps.produto_id AND pi.active_flg = true
        WHERE ps.active_flg = true
          AND ps.data_producao >= ${hojeStr}::date
          AND ps.data_producao <= ${fimStr}::date
          AND pi.insumo_id > 0
        GROUP BY pi.insumo_id
      ),
      ultima_compra AS (
        SELECT DISTINCT ON (ci.insumo_id)
               ci.insumo_id, ci.valor_unitario, c.data_compra
        FROM t_compra_item ci
        JOIN t_compra c ON c.compra_id = ci.compra_id AND c.active_flg = true
        WHERE ci.active_flg = true AND ci.insumo_id IS NOT NULL
        ORDER BY ci.insumo_id, c.data_compra DESC, ci.item_id DESC
      )
      SELECT i.insumo_id, i.nome, i.unidade,
             i.estoque_atual, i.estoque_minimo, i.preco_custo,
             COALESCE(cs.previsto, 0)::numeric AS consumo_previsto,
             uc.valor_unitario                 AS ultimo_valor,
             uc.data_compra                    AS ultima_compra
      FROM t_insumo i
      LEFT JOIN consumo       cs ON cs.insumo_id = i.insumo_id
      LEFT JOIN ultima_compra uc ON uc.insumo_id = i.insumo_id
      WHERE i.active_flg = true
      ORDER BY i.nome
    `)

    const todos = (res.rows as any[]).map(r => {
      const atual      = Number(r.estoque_atual ?? 0)
      const minimo     = Number(r.estoque_minimo ?? 0)
      const consumo    = Number(r.consumo_previsto ?? 0)
      const necessario = minimo + consumo
      return {
        insumoId:        Number(r.insumo_id),
        nome:            r.nome,
        unidade:         r.unidade ?? '',
        estoqueAtual:    atual,
        estoqueMinimo:   minimo,
        consumoPrevisto: consumo,
        necessario,
        sugerido:        Math.max(0, necessario - atual),
        ultimoPreco:     Number(r.ultimo_valor ?? r.preco_custo ?? 0),
        precoEstimado:   r.ultimo_valor === null || r.ultimo_valor === undefined,
        ultimaCompra:    r.ultima_compra ?? null,
        critico:         atual < minimo,
      }
    })

    const aComprar = todos.filter(i => i.sugerido > 0)
    return {
      itens: aComprar,
      kpis: {
        aComprar:      aComprar.length,
        criticos:      todos.filter(i => i.critico).length,
        valorEstimado: aComprar.reduce((a, i) => a + Math.round(i.sugerido * i.ultimoPreco), 0),
        diasProjecao,
      },
    }
  }

  // ── HISTÓRICO ─────────────────────────────────────────────────────────────
  async list({ dataInicio, dataFim, tipo = 'insumo' }: { dataInicio?: string; dataFim?: string; tipo?: 'insumo' | 'despesa' } = {}) {
    const ini = dataInicio ?? '1970-01-01'
    const fim = dataFim    ?? '2999-12-31'

    // UMA LINHA POR ITEM (QA #126, reteste). Quem olha o histórico procura um
    // insumo: quanto comprou e a que preço, cada vez. Compra antiga com vários
    // itens aparece desmembrada; compra nova só tem um item.
    //
    // Data do pagamento: à vista, é a da compra; a prazo, a baixa da conta a
    // pagar quando já foi paga, senão o vencimento.
    const res = await this.db.execute(sql`
      SELECT c.compra_id, c.data_compra, c.documento, c.condicao, c.categoria,
             c.forma_pagamento, c.data_vencimento, c.valor_total, c.status,
             c.observacao, c.despesa_id, c.conta_pagar_id,
             COALESCE(NULLIF(TRIM(c.nome_fornecedor), ''), f.nome_fantasia, f.nome_completo, 'Não informado') AS fornecedor,
             CASE WHEN c.condicao = 'a_prazo'
                  THEN COALESCE(cp.data_pagamento, c.data_vencimento)
                  ELSE c.data_compra END AS data_pagamento,
             ci.item_id, ci.nome_insumo, ci.unidade, ci.quantidade, ci.valor_unitario, ci.subtotal
      FROM t_compra c
      JOIN t_compra_item ci ON ci.compra_id = c.compra_id AND ci.active_flg = true
      LEFT JOIN t_fornecedor f ON f.fornecedor_id = c.fornecedor_id
      LEFT JOIN t_conta_pagar cp ON cp.conta_pagar_id = c.conta_pagar_id
      WHERE c.active_flg = true
        AND COALESCE(c.tipo, 'insumo') = ${tipo}
        AND c.data_compra >= ${ini}::date
        AND c.data_compra <= ${fim}::date
      ORDER BY c.data_compra DESC, c.compra_id DESC, ci.item_id
    `)

    const itens: any[] = (res.rows as any[]).map(r => ({
      itemId:         Number(r.item_id),
      compraId:       Number(r.compra_id),
      legado:         false,
      data:           r.data_compra,
      fornecedor:     r.fornecedor,
      documento:      r.documento ?? '',
      item:           r.nome_insumo ?? '',
      categoria:      r.categoria ?? '',
      unidade:        r.unidade ?? '',
      quantidade:     Number(r.quantidade ?? 0),
      valorUnitario:  Number(r.valor_unitario ?? 0),
      valorTotal:     Number(r.subtotal ?? 0),
      compraTotal:    Number(r.valor_total ?? 0),
      condicao:       r.condicao,
      formaPagamento: r.forma_pagamento ?? '',
      dataPagamento:  r.data_pagamento ?? null,
      status:         r.status,
      observacao:     r.observacao ?? '',
    }))

    // Despesas lançadas antes da padronização (tela de Despesas do Financeiro,
    // recorrentes, contas a pagar lançadas à mão) não são t_compra. Entram
    // aqui para não sumirem de vista — menos as que nasceram de uma compra,
    // que já estão na lista acima ou na de insumos.
    if (tipo === 'despesa') {
      const leg = await this.db.execute(sql`
        SELECT d.despesa_id, d.nome, d.categoria, d.valor, d.data_despesa,
               d.data_pagamento, d.conta_pagar_id, d.observacao
          FROM t_despesa d
         WHERE d.active_flg = true
           AND d.data_despesa::date >= ${ini}::date
           AND d.data_despesa::date <= ${fim}::date
           AND NOT EXISTS (
             SELECT 1 FROM t_compra c
              WHERE c.despesa_id = d.despesa_id
                 OR (d.conta_pagar_id IS NOT NULL AND c.conta_pagar_id = d.conta_pagar_id)
           )
      `)
      for (const r of leg.rows as any[]) {
        const valor = Number(r.valor ?? 0)
        itens.push({
          itemId:         -Number(r.despesa_id),
          compraId:       null,
          despesaId:      Number(r.despesa_id),
          legado:         true,
          data:           r.data_despesa,
          fornecedor:     '',
          documento:      '',
          item:           r.nome ?? '',
          categoria:      r.categoria ?? '',
          unidade:        '',
          quantidade:     1,
          valorUnitario:  valor,
          valorTotal:     valor,
          compraTotal:    valor,
          condicao:       r.conta_pagar_id ? 'a_prazo' : 'a_vista',
          formaPagamento: '',
          dataPagamento:  r.data_pagamento ?? (r.conta_pagar_id ? null : r.data_despesa),
          status:         'registrada',
          observacao:     r.observacao ?? '',
        })
      }
      itens.sort((x, y) => new Date(y.data).getTime() - new Date(x.data).getTime())
    }

    // KPIs contam COMPRAS, não linhas: compra antiga com 3 itens é 1 compra.
    const compras = new Map<string, { aPrazo: boolean }>()
    for (const i of itens) {
      const k = i.legado ? `d${i.despesaId}` : `c${i.compraId}`
      if (!compras.has(k)) compras.set(k, { aPrazo: i.condicao === 'a_prazo' })
    }
    const total = itens.reduce((a, i) => a + i.valorTotal, 0)
    return {
      itens,
      kpis: {
        quantidade:  compras.size,
        valorTotal:  total,
        aPrazo:      Array.from(compras.values()).filter(c => c.aPrazo).length,
        ticketMedio: compras.size > 0 ? Math.round(total / compras.size) : 0,
      },
    }
  }

  // Despesa lançada antes da padronização: sai do DRE. Não é t_compra, então
  // não passa pelo cancelar() abaixo.
  async excluirDespesaAntiga(despesaId: number, userId: number) {
    await this.db.execute(sql`
      UPDATE t_despesa SET active_flg = false, updated_dt = NOW(), updated_by = ${userId}
       WHERE despesa_id = ${despesaId}
         AND NOT EXISTS (SELECT 1 FROM t_compra c WHERE c.despesa_id = ${despesaId})
    `)
    return { despesaId }
  }

  // ── REGISTRAR COMPRA ──────────────────────────────────────────────────────
  async criar(payload: {
    // Compra de despesa (QA #123): mesmo formulário, não entra no estoque e
    // leva a categoria da despesa em vez de 'Insumos'.
    tipo?: 'insumo' | 'despesa'
    categoria?: string
    fornecedorId?: number | null
    nomeFornecedor?: string
    dataCompra: string
    documento?: string
    condicao: 'a_vista' | 'a_prazo'
    formaPagamento?: string
    dataVencimento?: string | null
    observacao?: string
    itens: {
      insumoId?: number | null
      nomeInsumo: string
      unidade?: string
      quantidade: number
      valorUnitario: number   // centavos
    }[]
    userId: number
  }) {
    const itens = (payload.itens ?? []).filter(i => i.nomeInsumo?.trim() && i.quantidade > 0)
    if (itens.length === 0) throw new Error('Informe ao menos um item com quantidade.')
    if (payload.condicao === 'a_prazo' && !payload.dataVencimento) {
      throw new Error('Compra a prazo exige data de vencimento.')
    }

    const valorTotal = itens.reduce((a, i) => a + Math.round(i.quantidade * i.valorUnitario), 0)
    const uid = payload.userId
    const ehDespesa  = payload.tipo === 'despesa'
    if (ehDespesa && !payload.categoria?.trim()) throw new Error('Informe a categoria da despesa.')
    const categoriaFin = ehDespesa ? payload.categoria!.trim() : 'Insumos'

    await this.db.execute(sql`BEGIN`)
    try {
      const cab = await this.db.execute(sql`
        INSERT INTO t_compra
          (tipo, categoria, fornecedor_id, nome_fornecedor, data_compra, documento, condicao,
           forma_pagamento, data_vencimento, valor_total, status, observacao,
           created_by, updated_by, created_dt, updated_dt, active_flg, modification_num)
        VALUES
          (${ehDespesa ? 'despesa' : 'insumo'}, ${ehDespesa ? categoriaFin : null},
           ${payload.fornecedorId ?? null}, ${payload.nomeFornecedor ?? null},
           ${payload.dataCompra}::date, ${payload.documento ?? null}, ${payload.condicao},
           ${payload.formaPagamento ?? null},
           ${payload.condicao === 'a_prazo' ? payload.dataVencimento : null}::date,
           ${valorTotal}, 'registrada', ${payload.observacao ?? null},
           ${uid}, ${uid}, NOW(), NOW(), true, 0)
        RETURNING compra_id
      `)
      const compraId = Number((cab.rows[0] as any).compra_id)

      for (const it of itens) {
        const subtotal = Math.round(it.quantidade * it.valorUnitario)

        await this.db.execute(sql`
          INSERT INTO t_compra_item
            (compra_id, insumo_id, nome_insumo, unidade, quantidade, valor_unitario, subtotal,
             created_by, updated_by, created_dt, updated_dt, active_flg, modification_num)
          VALUES
            (${compraId}, ${ehDespesa ? null : (it.insumoId ?? null)}, ${it.nomeInsumo.trim()}, ${it.unidade ?? null},
             ${it.quantidade}, ${it.valorUnitario}, ${subtotal},
             ${uid}, ${uid}, NOW(), NOW(), true, 0)
        `)

        if (it.insumoId && !ehDespesa) {
          await this.db.execute(sql`
            UPDATE t_insumo
               SET estoque_atual = estoque_atual + ${it.quantidade},
                   preco_custo   = ${it.valorUnitario},
                   updated_dt    = NOW(),
                   updated_by    = ${uid}
             WHERE insumo_id = ${it.insumoId}
          `)

          // data_movimentacao leva NOW(), não ${payload.dataCompra}::date: um
          // cast pra date puro grava meia-noite, diferente de toda outra
          // origem de movimentação (venda, produção, ajuste), que grava o
          // instante real. Isso não perde a compra da consulta (o filtro é
          // por dia, não por hora), mas tira a precisão de quando ela
          // realmente entrou no sistema — e destoa do resto do extrato.
          await this.db.execute(sql`
            INSERT INTO t_movimentacao_estoque
              (tipo, entidade, entidade_id, quantidade, preco_custo, observacao,
               data_movimentacao, created_by, updated_by, created_dt, updated_dt, active_flg, modification_num)
            VALUES
              ('entrada', 'insumo', ${it.insumoId}, ${it.quantidade}, ${it.valorUnitario},
               ${`Compra #${compraId}${payload.documento ? ` · doc ${payload.documento}` : ''}`},
               NOW(), ${uid}, ${uid}, NOW(), NOW(), true, 0)
          `)
        }
      }

      // Despesa aparece no Financeiro pelo que foi comprado (a fita crepe),
      // não pelo número da compra.
      const descricao = ehDespesa
        ? `${itens[0].nomeInsumo.trim()}${payload.nomeFornecedor ? ` — ${payload.nomeFornecedor}` : ''}`
        : `Compra${payload.documento ? ` ${payload.documento}` : ` #${compraId}`}` +
          (payload.nomeFornecedor ? ` — ${payload.nomeFornecedor}` : '')

      let despesaId: number | null    = null
      let contaPagarId: number | null = null

      if (payload.condicao === 'a_prazo') {
        const cp = await this.db.execute(sql`
          INSERT INTO t_conta_pagar
            (descricao, fornecedor_id, nome_fornecedor, categoria, numero_documento,
             valor_original, valor_pago, data_emissao, data_vencimento,
             status, forma_pagamento, origem, observacao,
             created_by, updated_by, created_dt, updated_dt, active_flg, modification_num)
          VALUES
            (${descricao}, ${payload.fornecedorId ?? null}, ${payload.nomeFornecedor ?? null},
             ${categoriaFin}, ${payload.documento ?? null},
             ${valorTotal}, 0, ${payload.dataCompra}::date, ${payload.dataVencimento}::date,
             'aberta', ${payload.formaPagamento ?? null}, 'compra', ${payload.observacao ?? null},
             ${uid}, ${uid}, NOW(), NOW(), true, 0)
          RETURNING conta_pagar_id
        `)
        contaPagarId = Number((cp.rows[0] as any).conta_pagar_id)

        // DRE PELA DATA DA COMPRA (QA #107). A despesa nasce agora, na
        // competência da compra e sem data de pagamento; o dinheiro sai no
        // vencimento, pela conta a pagar acima, e a baixa dela só preenche
        // data_pagamento (ContasPagarService.baixar). conta_pagar_id liga as
        // duas e impede a baixa de lançar uma segunda despesa.
        const dtC = new Date(`${payload.dataCompra}T12:00:00`)
        const dspP = await this.db.execute(sql`
          INSERT INTO t_despesa
            (nome, categoria, valor, data_despesa, data_pagamento, recorrente,
             mes_competencia, ano_competencia, observacao, conta_pagar_id,
             created_by, updated_by, created_dt, updated_dt, active_flg, modification_num)
          VALUES
            (${descricao}, ${categoriaFin}, ${valorTotal}, ${payload.dataCompra}::date, NULL, false,
             ${dtC.getMonth() + 1}, ${dtC.getFullYear()}, ${payload.observacao ?? null}, ${contaPagarId},
             ${uid}, ${uid}, NOW(), NOW(), true, 0)
          RETURNING despesa_id
        `)
        despesaId = Number((dspP.rows[0] as any).despesa_id)
      } else {
        const dt  = new Date(`${payload.dataCompra}T12:00:00`)
        const dsp = await this.db.execute(sql`
          INSERT INTO t_despesa
            (nome, categoria, valor, data_despesa, data_pagamento, recorrente,
             mes_competencia, ano_competencia, observacao,
             created_by, updated_by, created_dt, updated_dt, active_flg, modification_num)
          VALUES
            -- A vista: compra e pagamento no mesmo dia.
            (${descricao}, ${categoriaFin}, ${valorTotal}, ${payload.dataCompra}::date, ${payload.dataCompra}::date, false,
             ${dt.getMonth() + 1}, ${dt.getFullYear()}, ${payload.observacao ?? null},
             ${uid}, ${uid}, NOW(), NOW(), true, 0)
          RETURNING despesa_id
        `)
        despesaId = Number((dsp.rows[0] as any).despesa_id)
      }

      await this.db.execute(sql`
        UPDATE t_compra
           SET despesa_id = ${despesaId}, conta_pagar_id = ${contaPagarId}
         WHERE compra_id = ${compraId}
      `)

      await this.db.execute(sql`COMMIT`)
      return { compraId, valorTotal, despesaId, contaPagarId, itens: itens.length }
    } catch (e) {
      await this.db.execute(sql`ROLLBACK`)
      throw e
    }
  }

  // ── CANCELAR ──────────────────────────────────────────────────────────────
  //
  // Inativa o documento e o que ele gerou no financeiro. NÃO devolve o
  // estoque: entre a compra e o cancelamento o insumo pode já ter sido usado
  // na produção, e subtrair às cegas deixaria saldo negativo. Corrigir saldo é
  // decisão de quem conta o estoque, em Estoque → Ajustar — que agora grava a
  // movimentação correspondente.
  async cancelar(compraId: number, userId: number) {
    await this.db.execute(sql`BEGIN`)
    try {
      const r = await this.db.execute(sql`
        SELECT despesa_id, conta_pagar_id FROM t_compra WHERE compra_id = ${compraId}
      `)
      const row = r.rows[0] as any
      if (!row) throw new Error('Compra não encontrada.')

      await this.db.execute(sql`
        UPDATE t_compra SET active_flg = false, status = 'cancelada',
               updated_dt = NOW(), updated_by = ${userId}
         WHERE compra_id = ${compraId}
      `)
      await this.db.execute(sql`
        UPDATE t_compra_item SET active_flg = false, updated_dt = NOW(), updated_by = ${userId}
         WHERE compra_id = ${compraId}
      `)
      if (row.despesa_id) {
        await this.db.execute(sql`
          UPDATE t_despesa SET active_flg = false, updated_dt = NOW(), updated_by = ${userId}
           WHERE despesa_id = ${row.despesa_id}
        `)
      }
      if (row.conta_pagar_id) {
        await this.db.execute(sql`
          UPDATE t_conta_pagar SET active_flg = false, updated_dt = NOW(), updated_by = ${userId}
           WHERE conta_pagar_id = ${row.conta_pagar_id}
        `)
        // A despesa da compra a prazo pode estar ligada só pela conta (as
        // lançadas na baixa, antes do QA #107) — sai do DRE junto.
        await this.db.execute(sql`
          UPDATE t_despesa SET active_flg = false, updated_dt = NOW(), updated_by = ${userId}
           WHERE conta_pagar_id = ${row.conta_pagar_id} AND active_flg = true
        `)
      }
      await this.db.execute(sql`COMMIT`)
      return { ok: true }
    } catch (e) {
      await this.db.execute(sql`ROLLBACK`)
      throw e
    }
  }
}
