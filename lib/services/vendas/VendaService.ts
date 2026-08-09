// ESTE ARQUIVO VAI EM: lib/services/vendas/VendaService.ts
import { and, eq, gte, lte, desc, count, sql } from 'drizzle-orm'
import type { AppDB } from '@/lib/db/connection'
import { pool } from '@/lib/db/connection'
import { dbVenda, dbVendaItem, dbVendaPagamento } from '@/lib/db/schemas/vendas'
import { dbProduto, dbCliente } from '@/lib/db/schemas/cadastros'
import { FiscalService } from '@/lib/services/fiscal/FiscalService'
import { ConfiguracoesService } from '@/lib/services/configuracoes/ConfiguracoesService'
import { CashbackService } from '@/lib/services/fidelidade/CashbackService'
import { CaixaService } from '@/lib/services/caixa/CaixaService'
import { converterUnidade } from '@/lib/unidades'

function resolverPreco(produto: any, tipoPrecao: string): number {
  switch (tipoPrecao) {
    case 'atacado_a': return produto.precoAtacadoA || produto.precoAtacado || produto.precoVarejo || 0
    case 'atacado_b': return produto.precoAtacadoB || produto.precoAtacado || produto.precoVarejo || 0
    case 'atacado_c': return produto.precoAtacadoC || produto.precoAtacado || produto.precoVarejo || 0
    case 'atacado_d': return produto.precoAtacadoD || produto.precoAtacado || produto.precoVarejo || 0
    case 'atacado_e': return produto.precoAtacadoE || produto.precoAtacado || produto.precoVarejo || 0
    default:          return produto.precoVarejo || 0
  }
}

/**
 * Converte quantidade da ficha técnica para a unidade do estoque.
 * Mesma lógica do DebitoInsumoService — centralizada aqui para uso interno.
 */


export class VendaService {
  constructor(private db: AppDB, private schemaName: string = '') {}

  async list({ page, limit, dataInicio, dataFim, origem, tipoEntrega }: {
    page: number; limit: number; dataInicio?: string; dataFim?: string; origem?: string; tipoEntrega?: string
  }) {
    const offset = (page - 1) * limit
    const conditions = [eq(dbVenda.activeFlag, true)]
    if (dataInicio) conditions.push(gte(dbVenda.vendidaEm, new Date(dataInicio)))
    if (dataFim) {
      const fim = new Date(dataFim); fim.setHours(23, 59, 59, 999)
      conditions.push(lte(dbVenda.vendidaEm, fim))
    }
    if (origem)      conditions.push(eq(dbVenda.origem, origem))
    if (tipoEntrega) conditions.push(eq(dbVenda.tipoEntrega, tipoEntrega))
    const whereClause = and(...conditions)

    const [vendas, totals] = await Promise.all([
      this.db.select().from(dbVenda).where(whereClause).orderBy(desc(dbVenda.vendidaEm)).limit(limit).offset(offset),
      this.db.select({ total: count() }).from(dbVenda).where(whereClause),
    ])

    // Nome do cliente: fantasia quando existe, senão razão social. Mesma
    // regra da listagem de Clientes, do PDV e de Pedidos — o nome que
    // aparece é aquele pelo qual a loja conhece o cliente.
    const clienteIds = [...new Set(vendas.filter(v => v.clienteId).map(v => v.clienteId!))]
    const clienteMap: Record<number, string> = {}
    if (clienteIds.length > 0) {
      const res = await this.db.execute(sql`
        SELECT cliente_id, nome_completo, nome_fantasia FROM t_cliente
      `)
      for (const c of res.rows as any[]) {
        const fantasia = String(c.nome_fantasia ?? '').trim()
        const razao    = String(c.nome_completo ?? '').trim()
        clienteMap[Number(c.cliente_id)] = fantasia || razao
      }
    }

    const total = Number(totals[0]?.total ?? 0)
    const data = vendas.map(v => {
      // Ordem: cliente cadastrado → nome avulso digitado na venda →
      // Consumidor Final, que é a verdade quando ninguém se identificou.
      const avulso = String((v as any).nomeClienteAvulso ?? '').trim()
      return {
        ...v,
        clienteNome: v.clienteId
          ? (clienteMap[v.clienteId] || `Cliente #${v.clienteId}`)
          : (avulso || 'Consumidor Final'),
        clienteAvulso: !v.clienteId && !!avulso,
      }
    })
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } }
  }

  async findById(id: number) {
    const [venda] = await this.db.select().from(dbVenda).where(eq(dbVenda.vendaId, id))
    if (!venda) return null
    const [itens, pagamentos] = await Promise.all([
      this.db.select().from(dbVendaItem).where(eq(dbVendaItem.vendaId, id)),
      this.db.select().from(dbVendaPagamento).where(eq(dbVendaPagamento.vendaId, id)),
    ])
    let cliente = null
    let clienteNome = String((venda as any).nomeClienteAvulso ?? '').trim() || 'Consumidor Final'
    if (venda.clienteId) {
      const [c] = await this.db.select().from(dbCliente).where(eq(dbCliente.clienteId, venda.clienteId))
      cliente = c ?? null
      const res = await this.db.execute(sql`
        SELECT nome_completo, nome_fantasia FROM t_cliente
        WHERE cliente_id = ${venda.clienteId} LIMIT 1
      `)
      const r        = (res.rows as any[])[0] ?? {}
      const fantasia = String(r.nome_fantasia ?? '').trim()
      const razao    = String(r.nome_completo ?? '').trim()
      clienteNome    = fantasia || razao || `Cliente #${venda.clienteId}`
    }
    return { ...venda, itens, pagamentos, cliente, clienteNome }
  }

  async kpis() {
    const now    = new Date()
    const hoje   = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const semana = new Date(hoje); semana.setDate(semana.getDate() - semana.getDay())
    const mes    = new Date(now.getFullYear(), now.getMonth(), 1)
    const base   = eq(dbVenda.activeFlag, true)

    const [hojeData, semanaData, mesData, entregasHoje] = await Promise.all([
      this.db.select({ total: sql<number>`COALESCE(SUM(total), 0)`, qtd: count() }).from(dbVenda).where(and(base, gte(dbVenda.vendidaEm, hoje))),
      this.db.select({ total: sql<number>`COALESCE(SUM(total), 0)` }).from(dbVenda).where(and(base, gte(dbVenda.vendidaEm, semana))),
      this.db.select({ total: sql<number>`COALESCE(SUM(total), 0)`, qtd: count(), ticketMedio: sql<number>`CASE WHEN COUNT(*) > 0 THEN COALESCE(SUM(total), 0) / COUNT(*) ELSE 0 END` }).from(dbVenda).where(and(base, gte(dbVenda.vendidaEm, mes))),
      this.db.select({ qtd: count() }).from(dbVenda).where(and(base, eq(dbVenda.tipoEntrega, 'entrega'), gte(dbVenda.dataEntrega, hoje), lte(dbVenda.dataEntrega, new Date(hoje.getTime() + 86400000)))),
    ])

    return {
      receitaHoje:   Number(hojeData[0]?.total ?? 0),
      qtdHoje:       Number(hojeData[0]?.qtd ?? 0),
      receitaSemana: Number(semanaData[0]?.total ?? 0),
      receitaMes:    Number(mesData[0]?.total ?? 0),
      qtdMes:        Number(mesData[0]?.qtd ?? 0),
      ticketMedio:   Number(mesData[0]?.ticketMedio ?? 0),
      entregasHoje:  Number(entregasHoje[0]?.qtd ?? 0),
    }
  }

  /**
   * Debita os insumos da ficha técnica de cada produto vendido.
   * Usa pool direto com search_path para garantir schema correto.
   */
  private async debitarInsumosDaVenda(itens: { produtoId: number; quantidade: number }[], userId: number) {
    if (!this.schemaName) return // sem schema, pula silenciosamente

    const client = await pool.connect()
    try {
      await client.query(`SET search_path TO "${this.schemaName}", public`)
      const now = new Date()

      for (const item of itens) {
        // Busca ficha técnica do produto
        const ficha = await client.query(`
          SELECT pi.insumo_id, pi.quantidade AS qtd_por_unidade, pi.unidade AS unidade_ficha,
                 i.unidade AS unidade_estoque, i.estoque_atual
          FROM t_produto_insumo pi
          JOIN t_insumo i ON i.insumo_id = pi.insumo_id AND i.active_flg = true
          WHERE pi.produto_id = $1 AND pi.active_flg = true
        `, [item.produtoId])

        for (const fi of ficha.rows) {
          const qtdPorUnidade = Number(fi.qtd_por_unidade)
          const qtdTotal      = converterUnidade(qtdPorUnidade * item.quantidade, fi.unidade_ficha, fi.unidade_estoque)
          const estoqueAtual  = Number(fi.estoque_atual)
          const novoEstoque   = Math.max(0, parseFloat((estoqueAtual - qtdTotal).toFixed(4)))

          await client.query(`
            UPDATE t_insumo SET estoque_atual = $1, updated_dt = $2, updated_by = $3
            WHERE insumo_id = $4
          `, [novoEstoque, now, userId, fi.insumo_id])
        }
      }
    } finally {
      client.release()
    }
  }

  /**
   * CANCELAMENTO DE VENDA — desfaz o que `criarDireta` fez.
   *
   * A venda não é apagada: fica com `active_flg = false` e `status =
   * 'cancelada'`. Some das listagens e dos relatórios, mas continua existindo.
   * Venda apagada de verdade deixa buraco na numeração que ninguém consegue
   * explicar seis meses depois.
   *
   * O que é revertido, nesta ordem, dentro de uma transação:
   *
   *   1. estoque do produto acabado  (devolve a quantidade vendida)
   *   2. estoque dos insumos          (recompõe pela ficha técnica)
   *   3. rascunho fiscal              (some, se ainda estiver pendente)
   *   4. a própria venda              (inativa)
   *
   * O cashback é estornado fora da transação, pelo CashbackService, porque ele
   * trabalha com o Drizzle e já é idempotente — reconhece estorno anterior e
   * não credita duas vezes.
   *
   * DUAS ASSIMETRIAS CONHECIDAS, que não dá para resolver com o dado que a
   * venda guarda hoje:
   *
   *   • A baixa de insumo usa `Math.max(0, ...)`: se o estoque já estava
   *     abaixo do necessário, baixou menos do que a ficha pedia. A devolução
   *     soma o valor cheio, então o insumo pode voltar com mais do que saiu.
   *   • A recomposição usa a ficha técnica de AGORA. Se a ficha mudou depois
   *     da venda, devolve pela receita nova. A venda não registra quais
   *     insumos consumiu — só os produtos.
   *
   * Resolver as duas exige gravar o consumo de insumo por venda, o que é
   * mudança de estrutura. Está no backlog, não aqui.
   */
  async cancelar(vendaId: number, userId: number) {
    if (!this.schemaName) {
      // Sem schema o SET search_path não acontece e as queries iriam para o
      // schema errado. Falhar alto é melhor do que reverter estoque de outro
      // cliente.
      throw new Error('SCHEMA_AUSENTE')
    }

    const client = await pool.connect()
    try {
      await client.query(`SET search_path TO "${this.schemaName}", public`)

      // active_flg = true na condição é o que impede cancelar duas vezes e
      // devolver o estoque em dobro.
      const venda = await client.query(
        `SELECT venda_id FROM t_venda WHERE venda_id = $1 AND active_flg = true`,
        [vendaId],
      )
      if (venda.rows.length === 0) return null

      const itens = await client.query(
        `SELECT produto_id, quantidade FROM t_venda_item
          WHERE venda_id = $1 AND active_flg = true`,
        [vendaId],
      )

      await client.query('BEGIN')
      try {
        for (const it of itens.rows as any[]) {
          const qtd = Number(it.quantidade)

          // 1. Produto acabado volta para o estoque.
          await client.query(
            `UPDATE t_produto
                SET estoque_atual = estoque_atual + $1, updated_dt = NOW(), updated_by = $2
              WHERE produto_id = $3`,
            [qtd, userId, it.produto_id],
          )

          // 2. Insumos da ficha voltam, com a mesma conversão de unidade da baixa.
          const ficha = await client.query(
            `SELECT pi.insumo_id, pi.quantidade AS qtd_por_unidade, pi.unidade AS unidade_ficha,
                    i.unidade AS unidade_estoque, i.estoque_atual
               FROM t_produto_insumo pi
               JOIN t_insumo i ON i.insumo_id = pi.insumo_id AND i.active_flg = true
              WHERE pi.produto_id = $1 AND pi.active_flg = true`,
            [it.produto_id],
          )
          for (const fi of ficha.rows as any[]) {
            const qtdTotal = converterUnidade(
              Number(fi.qtd_por_unidade) * qtd,
              fi.unidade_ficha,
              fi.unidade_estoque,
            )
            const novo = parseFloat((Number(fi.estoque_atual) + qtdTotal).toFixed(4))
            await client.query(
              `UPDATE t_insumo
                  SET estoque_atual = $1, updated_dt = NOW(), updated_by = $2
                WHERE insumo_id = $3`,
              [novo, userId, fi.insumo_id],
            )
          }
        }

        // 3. Rascunho fiscal. Só o que ainda está pendente — nota já emitida
        //    não se desfaz por aqui, cancelamento na SEFAZ é outro processo.
        const temNota = await client.query(
          `SELECT to_regclass('t_nota_fiscal') IS NOT NULL AS existe`,
        )
        if (temNota.rows[0]?.existe) {
          await client.query(
            `UPDATE t_nota_fiscal
                SET status = 'cancelada', active_flg = false, updated_dt = NOW(), updated_by = $1
              WHERE venda_id = $2 AND status = 'pendente'`,
            [userId, vendaId],
          )
        }

        // 4. A venda.
        await client.query(
          `UPDATE t_venda
              SET active_flg = false, status = 'cancelada', updated_dt = NOW(), updated_by = $1
            WHERE venda_id = $2`,
          [userId, vendaId],
        )

        await client.query('COMMIT')
      } catch (e) {
        await client.query('ROLLBACK')
        throw e
      }
    } finally {
      client.release()
    }

    // Fora da transação: o estorno é idempotente e a falta de fidelidade
    // configurada não pode impedir o cancelamento da venda.
    let estornoCashback = false
    try {
      await new CashbackService(this.db).estornarVenda(vendaId, userId)
      estornoCashback = true
    } catch (_) {}

    return { cancelado: true, estornoCashback }
  }

  /**
   * EDIÇÃO DE VENDA — só o que não mexe em dinheiro nem em estoque.
   *
   * Cliente, vendedor, entrega e observações podem ser corrigidos sem
   * consequência: nenhum deles entra no cálculo de total, na baixa de estoque
   * ou no cashback já creditado.
   *
   * Item, quantidade, preço e forma de pagamento ficam de fora de propósito.
   * Mudar qualquer um deles exigiria refazer a baixa de estoque, a ficha
   * técnica, o cashback e o rascunho fiscal — e um erro no meio disso deixa o
   * estoque mentindo sem ninguém perceber. Para esses casos o caminho é
   * cancelar e lançar de novo, que é como o operador de balcão já pensa.
   */
  async atualizarDados(
    vendaId: number,
    payload: {
      clienteId?:         number | null
      nomeClienteAvulso?: string | null
      vendedor?:          string | null
      tipoEntrega?:       string | null
      dataEntrega?:       string | null
      enderecoEntrega?:   string | null
      observacao?:        string | null
      observacaoInterna?: string | null
    },
    userId: number,
  ) {
    const updates: any = { updatedDt: new Date(), updatedBy: userId }

    // Cliente cadastrado e nome avulso são excludentes: com cadastro, o
    // cadastro manda. Mesma regra do criarDireta.
    if (payload.clienteId !== undefined) {
      updates.clienteId = payload.clienteId || null
      if (payload.clienteId) updates.nomeClienteAvulso = null
    }
    if (payload.nomeClienteAvulso !== undefined && !payload.clienteId) {
      updates.nomeClienteAvulso = payload.nomeClienteAvulso?.trim() || null
    }
    if (payload.vendedor          !== undefined) updates.vendedor          = payload.vendedor || null
    // tipo_entrega é NOT NULL no banco: só sobrescreve com valor de verdade,
    // senão um campo vazio no formulário derrubaria o UPDATE inteiro.
    if (payload.tipoEntrega) updates.tipoEntrega = payload.tipoEntrega
    if (payload.enderecoEntrega   !== undefined) updates.enderecoEntrega   = payload.enderecoEntrega || null
    if (payload.observacao        !== undefined) updates.observacao        = payload.observacao || null
    if (payload.observacaoInterna !== undefined) updates.observacaoInterna = payload.observacaoInterna || null
    if (payload.dataEntrega       !== undefined) {
      updates.dataEntrega = payload.dataEntrega ? new Date(payload.dataEntrega) : null
    }

    const [result] = await this.db
      .update(dbVenda)
      .set(updates)
      .where(and(eq(dbVenda.vendaId, vendaId), eq(dbVenda.activeFlag, true)))
      .returning({ vendaId: dbVenda.vendaId })

    return result ?? null
  }

  async criarDireta({ itens, clienteId, nomeClienteAvulso, desconto, pagamentos, tipoEntrega, dataEntrega, enderecoEntrega, observacao, observacaoInterna, vendedor, usarCashback, documentoFiscal, numeroCaixa, userId }: {
    itens: { produtoId: number; quantidade: number; tipoPrecao?: string; desconto?: number }[]
    clienteId?:         number
    // Cliente avulso: só um nome. Sem cliente_id não há cashback nem
    // histórico — é o limite de não cadastrar.
    nomeClienteAvulso?: string
    desconto:           number   // desconto geral da venda (no PDV já vem líquido do acréscimo)
    pagamentos:         { forma: string; valor: number }[]
    tipoEntrega?:       string
    dataEntrega?:       string
    enderecoEntrega?:   string
    observacao?:        string
    observacaoInterna?: string
    vendedor?:          string
    usarCashback?:      number   // centavos que o cliente quer resgatar
    // nenhum | nfce | nfe. Decidido no fechamento, no PDV.
    documentoFiscal?:   string
    // Qual máquina fez a venda. Cada PC guarda o próprio número.
    numeroCaixa?:       number
    userId:             number
  }) {
    const now = new Date()
    let subtotal = 0          // bruto (soma de preço x quantidade, sem descontos)
    let descontoItens = 0     // soma dos descontos aplicados linha a linha
    const itemsDetalhados: any[] = []

    for (const item of itens) {
      const [produto] = await this.db.select().from(dbProduto)
        .where(and(eq(dbProduto.produtoId, item.produtoId), eq(dbProduto.activeFlag, true)))
      if (!produto) throw new Error(`Produto ${item.produtoId} não encontrado ou inativo`)

      const tipoPrecao    = item.tipoPrecao ?? 'varejo'
      const precoUnitario = resolverPreco(produto, tipoPrecao)
      const itemBruto     = precoUnitario * item.quantidade
      // Desconto do item nunca passa do valor do próprio item
      const descontoItem  = Math.max(0, Math.min(item.desconto ?? 0, itemBruto))
      const itemSubtotal  = itemBruto - descontoItem

      subtotal      += itemBruto
      descontoItens += descontoItem

      const labelTipo: Record<string, string> = {
        varejo: 'Varejo', atacado_a: 'Atacado A', atacado_b: 'Atacado B',
        atacado_c: 'Atacado C', atacado_d: 'Atacado D', atacado_e: 'Atacado E',
      }

      itemsDetalhados.push({
        produtoId: produto.produtoId, nomeProduto: produto.nome,
        quantidade: item.quantidade, tipoPrecao,
        nomeTipoPrecao: labelTipo[tipoPrecao] ?? 'Varejo',
        precoUnitario, desconto: descontoItem, subtotal: itemSubtotal,
      })
    }

    // O desconto gravado na venda soma os descontos de item com o desconto geral,
    // pra que subtotal - desconto = total continue verdadeiro nos relatórios.
    const descontoTotal = descontoItens + desconto
    const total = Math.max(0, subtotal - descontoTotal)

    // Nome avulso só vale sem cliente cadastrado — com cadastro, o cadastro manda.
    const avulso = clienteId ? null : (nomeClienteAvulso?.trim() || null)

    // Turno em que esta venda entra. Null quando o controle de caixa está
    // desligado — que é o padrão — e a venda segue normalmente.
    let turnoDaVenda: any = null
    try {
      turnoDaVenda = await new CaixaService(this.db).turnoDaVenda(numeroCaixa)
    } catch (_) { /* controle de caixa ausente ou desligado */ }

    const [venda] = await this.db.insert(dbVenda).values({
      origem:            'direta',
      clienteId:         clienteId ?? null,
      nomeClienteAvulso: avulso,
      status:            'concluida',
      tipoEntrega:       tipoEntrega || 'Retirada',
      dataEntrega:       dataEntrega ? new Date(dataEntrega) : null,
      enderecoEntrega:   enderecoEntrega || null,
      subtotal, desconto: descontoTotal, total,
      observacao:        observacao || null,
      observacaoInterna: observacaoInterna || null,
      vendedor:          vendedor || null,
      documentoFiscal:   documentoFiscal || 'nenhum',
      // De qual caixa e de qual turno saiu. Sem isto o fechamento sabe que a
      // loja ficou curta, mas não em qual máquina — e, com vários turnos
      // simultâneos, o relatório de cada caixa mostraria o total da loja.
      turnoId:           turnoDaVenda?.turnoId ?? null,
      numeroCaixa:       numeroCaixa ?? turnoDaVenda?.numeroCaixa ?? null,
      vendidaEm:         now,
      createdBy: userId, updatedBy: userId, createdDt: now, updatedDt: now,
    }).returning({ vendaId: dbVenda.vendaId })

    for (const item of itemsDetalhados) {
      try {
        await this.db.execute(sql`
          INSERT INTO t_venda_item (
            venda_id, produto_id, nome_produto, quantidade,
            tipo_precao, nome_tipo_precao, preco_unitario, desconto, subtotal,
            created_by, updated_by, created_dt, updated_dt, active_flg, modification_num
          ) VALUES (
            ${venda.vendaId}, ${item.produtoId}, ${item.nomeProduto}, ${item.quantidade},
            ${item.tipoPrecao}, ${item.nomeTipoPrecao}, ${item.precoUnitario}, ${item.desconto}, ${item.subtotal},
            ${userId}, ${userId}, ${now.toISOString()}, ${now.toISOString()}, true, 0
          )
        `)
      } catch {
        await this.db.insert(dbVendaItem).values({
          vendaId: venda.vendaId, produtoId: item.produtoId, nomeProduto: item.nomeProduto,
          quantidade: item.quantidade, precoUnitario: item.precoUnitario,
          desconto: item.desconto, subtotal: item.subtotal,
          createdBy: userId, updatedBy: userId, createdDt: now, updatedDt: now,
        })
      }
    }

    for (const pag of pagamentos) {
      await this.db.insert(dbVendaPagamento).values({
        vendaId: venda.vendaId, forma: pag.forma, valor: pag.valor,
        createdBy: userId, updatedBy: userId, createdDt: now, updatedDt: now,
      })
    }

    // Debita estoque do produto acabado
    for (const item of itemsDetalhados) {
      await this.db.update(dbProduto).set({
        estoqueAtual: sql`${dbProduto.estoqueAtual} - ${item.quantidade}`,
        updatedDt: now, updatedBy: userId,
      }).where(eq(dbProduto.produtoId, item.produtoId))
    }

    // Debita insumos da ficha técnica via pool direto com search_path
    try {
      await this.debitarInsumosDaVenda(
        itemsDetalhados.map(i => ({ produtoId: i.produtoId, quantidade: i.quantidade })),
        userId
      )
    } catch (_) {
      // Não bloqueia a venda se o débito de insumos falhar
    }

    // ── Fidelidade / Cashback ────────────────────────────────────────────────
    // Nunca deixa o cashback quebrar a venda: tudo dentro de try/catch.
    // Cliente avulso não entra aqui: cashback é saldo de alguém, e sem
    // cliente_id não existe alguém.
    let cashbackUsado = 0
    let cashbackCreditado = 0
    try {
      const cash = new CashbackService(this.db)
      // 1. Resgate: usa saldo do cliente, se pedido. Registra como um pagamento
      //    "Cashback (fidelidade)" pra reconciliar o total.
      if (clienteId && usarCashback && usarCashback > 0) {
        cashbackUsado = await cash.usar({ clienteId, vendaId: venda.vendaId, total, solicitado: usarCashback, userId })
        if (cashbackUsado > 0) {
          await this.db.insert(dbVendaPagamento).values({
            vendaId: venda.vendaId, forma: 'Cashback (fidelidade)', valor: cashbackUsado,
            createdBy: userId, updatedBy: userId, createdDt: now, updatedDt: now,
          })
        }
      }
      // 2. Crédito: gera cashback pela venda (sobre o valor efetivamente pago).
      cashbackCreditado = await cash.creditar({
        clienteId, vendaId: venda.vendaId, subtotal, total, cashbackUsado, userId,
      })
    } catch (_) {
      // fidelidade não configurada / tabelas ausentes — ignora
    }

    // Gera rascunho fiscal se módulo ativo
    try {
      // O rascunho só nasce se a venda pediu nota. Antes ele era criado em
      // toda venda com o módulo ligado, e o balcão acumulava rascunho de
      // cupom que ninguém ia emitir — sujando a fila do módulo Fiscal.
      const cfg = await new ConfiguracoesService(this.db).get()
      if (cfg?.fiscalAtivo && documentoFiscal && documentoFiscal !== 'nenhum') {
        await new FiscalService(this.db).criarNota({
          tipo: 'NFC-e', valorTotal: total, vendaId: venda.vendaId,
          // produtoId vai junto: é por ele que o FiscalService acha o NCM e o
          // perfil tributário. Sem isso a nota nasce sem classificação fiscal
          // e a emissão recusa.
          itens: itemsDetalhados.map(item => ({
            produtoId: item.produtoId,
            descricao: item.nomeProduto, quantidade: item.quantidade, precoUnitario: item.precoUnitario,
          })),
          userId,
        })
      }
    } catch (_) {}

    return { vendaId: venda.vendaId, cashbackUsado, cashbackCreditado }
  }
}