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
  async list({ dataInicio, dataFim }: { dataInicio?: string; dataFim?: string } = {}) {
    const ini = dataInicio ?? '1970-01-01'
    const fim = dataFim    ?? '2999-12-31'

    const res = await this.db.execute(sql`
      SELECT c.compra_id, c.data_compra, c.documento, c.condicao,
             c.forma_pagamento, c.data_vencimento, c.valor_total, c.status,
             c.observacao, c.despesa_id, c.conta_pagar_id,
             COALESCE(NULLIF(TRIM(c.nome_fornecedor), ''), f.nome_fantasia, f.nome_completo, 'Não informado') AS fornecedor,
             COALESCE((
               SELECT STRING_AGG(ci.nome_insumo, ', ' ORDER BY ci.item_id)
               FROM t_compra_item ci
               WHERE ci.compra_id = c.compra_id AND ci.active_flg = true
             ), '') AS itens_texto,
             COALESCE((
               SELECT COUNT(*) FROM t_compra_item ci
               WHERE ci.compra_id = c.compra_id AND ci.active_flg = true
             ), 0)::int AS qtd_itens
      FROM t_compra c
      LEFT JOIN t_fornecedor f ON f.fornecedor_id = c.fornecedor_id
      WHERE c.active_flg = true
        AND c.data_compra >= ${ini}::date
        AND c.data_compra <= ${fim}::date
      ORDER BY c.data_compra DESC, c.compra_id DESC
    `)

    const itens = (res.rows as any[]).map(r => ({
      compraId:       Number(r.compra_id),
      data:           r.data_compra,
      fornecedor:     r.fornecedor,
      documento:      r.documento ?? '',
      condicao:       r.condicao,
      formaPagamento: r.forma_pagamento ?? '',
      vencimento:     r.data_vencimento ?? null,
      valorTotal:     Number(r.valor_total ?? 0),
      status:         r.status,
      qtdItens:       Number(r.qtd_itens ?? 0),
      itensTexto:     r.itens_texto ?? '',
      observacao:     r.observacao ?? '',
    }))

    const total = itens.reduce((a, i) => a + i.valorTotal, 0)
    return {
      itens,
      kpis: {
        quantidade:  itens.length,
        valorTotal:  total,
        aPrazo:      itens.filter(i => i.condicao === 'a_prazo').length,
        ticketMedio: itens.length > 0 ? Math.round(total / itens.length) : 0,
      },
    }
  }

  // ── REGISTRAR COMPRA ──────────────────────────────────────────────────────
  async criar(payload: {
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

    await this.db.execute(sql`BEGIN`)
    try {
      const cab = await this.db.execute(sql`
        INSERT INTO t_compra
          (fornecedor_id, nome_fornecedor, data_compra, documento, condicao,
           forma_pagamento, data_vencimento, valor_total, status, observacao,
           created_by, updated_by, created_dt, updated_dt, active_flg, modification_num)
        VALUES
          (${payload.fornecedorId ?? null}, ${payload.nomeFornecedor ?? null},
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
            (${compraId}, ${it.insumoId ?? null}, ${it.nomeInsumo.trim()}, ${it.unidade ?? null},
             ${it.quantidade}, ${it.valorUnitario}, ${subtotal},
             ${uid}, ${uid}, NOW(), NOW(), true, 0)
        `)

        if (it.insumoId) {
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

      const descricao =
        `Compra${payload.documento ? ` ${payload.documento}` : ` #${compraId}`}` +
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
             'Insumos', ${payload.documento ?? null},
             ${valorTotal}, 0, ${payload.dataCompra}::date, ${payload.dataVencimento}::date,
             'aberta', ${payload.formaPagamento ?? null}, 'compra', ${payload.observacao ?? null},
             ${uid}, ${uid}, NOW(), NOW(), true, 0)
          RETURNING conta_pagar_id
        `)
        contaPagarId = Number((cp.rows[0] as any).conta_pagar_id)
      } else {
        const dt  = new Date(`${payload.dataCompra}T12:00:00`)
        const dsp = await this.db.execute(sql`
          INSERT INTO t_despesa
            (nome, categoria, valor, data_despesa, data_pagamento, recorrente,
             mes_competencia, ano_competencia, observacao,
             created_by, updated_by, created_dt, updated_dt, active_flg, modification_num)
          VALUES
            -- A vista: compra e pagamento no mesmo dia.
            (${descricao}, 'Insumos', ${valorTotal}, ${payload.dataCompra}::date, ${payload.dataCompra}::date, false,
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
      }
      await this.db.execute(sql`COMMIT`)
      return { ok: true }
    } catch (e) {
      await this.db.execute(sql`ROLLBACK`)
      throw e
    }
  }
}
