// @ts-nocheck
// ESTE ARQUIVO VAI EM: app/api/[tenant]/pedidos/[id]/route.ts
//
// ─── FLUXO DO PEDIDO ─────────────────────────────────────────────────────────
//
// Pendente / Em Produção / Pronto → NÃO tocam no estoque.
//   O pedido é demanda: aparece na coluna Ped da grade de Produção e derruba a
//   Prev. Est. Quem faz o estoque entrar é o registro de produção na coluna PP,
//   e é lá que o insumo é debitado.
//
//   A versão anterior somava o estoque ao marcar "Pronto". Como a produção já
//   entrava pela grade, o produto era contado DUAS vezes.
//
// Entregue → é a venda.
//   Numa transação só: debita o produto acabado, cria a venda com origem
//   'pedido', grava o venda_id no pedido, registra a movimentação de estoque e
//   abre a conta a receber com vencimento na previsão de entrega.
//
//   O insumo NÃO é debitado aqui. Ele já saiu quando a produção foi
//   registrada — debitar de novo tiraria a mesma farinha duas vezes.
//
// Cancelado → não reverte nada, porque nada foi somado.
//   Cancelar pedido JÁ ENTREGUE é bloqueado: existe venda e conta a receber,
//   e desfazer isso em silêncio corromperia o financeiro.
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { resolveTenant } from '@/lib/auth/tenant'
import { exigirModulo } from '@/lib/auth/permissoes'
import { getDbForTenant } from '@/lib/db/connection'
import { pool } from '@/lib/db/connection'
import { PedidoService } from '@/lib/services/producao/PedidoService'
import { FiscalService } from '@/lib/services/fiscal/FiscalService'
import { ConfiguracoesService } from '@/lib/services/configuracoes/ConfiguracoesService'
import { ok, serverError, notFound, badRequest } from '@/lib/api/responses'

type Params = { params: { tenant: string; id: string } }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    await exigirModulo(tenant.schemaName, 'pedidos')
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const result = await new PedidoService(db).findById(Number(params.id))
      if (!result) return notFound('Pedido não encontrado')
      return ok(result)
    } finally { release() }
  } catch (err) { return serverError(err) }
}

// ── EDITAR PEDIDO ────────────────────────────────────────────────────────────
// PUT atualiza cliente, tipo, data do pedido, previsão de produção, previsão
// de entrega, endereço, observação e a lista de itens. Só permitido enquanto
// o pedido não foi entregue — depois da entrega o estoque já saiu e existe
// conta a receber aberta pelo valor, e mudar os itens tornaria a cobrança
// mentirosa.
const atualizarPedidoSchema = z.object({
  clienteId:         z.number().int().optional(),
  // Cliente avulso: só um nome, para quem não vale cadastrar.
  nomeClienteAvulso: z.string().max(200).optional().nullable(),
  tipoVenda:        z.enum(['balcao', 'entrega']).default('entrega'),
  dataPedido:       z.string(),
  previsaoProducao: z.string().optional(),
  previsaoEntrega:  z.string().optional(),
  valorEntrega:     z.number().int().default(0),
  enderecoEntrega:  z.string().max(300).optional(),
  observacao:       z.string().max(500).optional(),
  // Intencao fiscal: a NF-e do pedido nasce na ENTREGA, nao na baixa.
  documentoFiscal:  z.enum(['nenhum', 'nfce', 'nfe']).optional(),
  imprimirNota:     z.boolean().optional(),
  itens: z.array(z.object({
    produtoId:     z.number().int(),
    quantidade:    z.number().int().min(1),
    precoUnitario: z.number().int().default(0),
  })).min(1),
})

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    await exigirModulo(tenant.schemaName, 'pedidos')
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const body    = await req.json()
      const payload = atualizarPedidoSchema.parse(body)
      const service = new PedidoService(db)

      const pedido = await service.findById(Number(params.id))
      if (!pedido) return notFound('Pedido não encontrado')
      if (['entregue', 'cancelado'].includes(pedido.status)) {
        return badRequest(`Pedido "${pedido.status}" não pode ser editado.`)
      }

      const result = await service.atualizar(Number(params.id), { ...payload, userId: 1 })
      return ok(result)
    } finally { release() }
  } catch (err) { return serverError(err) }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    await exigirModulo(tenant.schemaName, 'pedidos')
    const { status, totalParcelas: totalParcelasRaw } = await req.json()
    if (!status) return badRequest('Status é obrigatório')
    // Venda a prazo parcelada (PDV "A Prazo" ou pedido normal com acordo de
    // parcelamento): divide a conta a receber gerada na entrega em N parcelas
    // mensais, em vez de uma só. Sem parcelas informadas, comportamento igual
    // a antes.
    const totalParcelas = Math.max(1, Number(totalParcelasRaw) || 1)

    const VALIDOS = ['pendente', 'producao', 'pronto', 'entregue', 'cancelado']
    if (!VALIDOS.includes(status)) return badRequest(`Status inválido: ${status}`)

    const pedidoId = Number(params.id)
    const client   = await pool.connect()
    try {
      await client.query(`SET search_path TO "${tenant.schemaName}", public`)

      // Cabeçalho do pedido + nome do cliente (para a conta a receber)
      const cab = await client.query(`
        SELECT p.pedido_id, p.status, p.cliente_id, p.nome_cliente_avulso, p.venda_id,
               p.tipo_venda, p.endereco_entrega, p.observacao,
               p.previsao_entrega, p.valor_entrega,
               COALESCE(p.documento_fiscal, 'nenhum') AS documento_fiscal,
               p.nota_id,
               cl.nome_completo AS cliente_razao,
               cl.nome_fantasia AS cliente_fantasia,
               -- documento, e nao cnpj_cpf: esta ultima e a coluna do
               -- FORNECEDOR. Como este SELECT roda antes de qualquer
               -- verificacao, o nome errado derrubava toda mudanca de etapa,
               -- nao so a entrega.
               cl.documento    AS cliente_documento,
               cl.uf           AS cliente_uf
        FROM t_pedido p
        LEFT JOIN t_cliente cl ON cl.cliente_id = p.cliente_id
        WHERE p.pedido_id = $1 AND p.active_flg = true
      `, [pedidoId])

      if (cab.rows.length === 0) return notFound('Pedido não encontrado')
      const pedido       = cab.rows[0]
      const statusAntigo = pedido.status

      if (statusAntigo === status) {
        return ok({ ok: true, status, pedidoId, message: 'Status já era esse.' })
      }

      // Entregue é irreversível: o estoque já saiu e existe conta a receber
      // aberta pelo valor do pedido.
      if (statusAntigo === 'entregue' && status !== 'entregue') {
        return badRequest(
          'Pedido já entregue não pode mudar de status. Exclua a conta a receber e ajuste o estoque se precisar desfazer.'
        )
      }

      // Itens do pedido
      const itensRes = await client.query(`
        SELECT produto_id, nome_produto, quantidade, preco_unitario, subtotal
        FROM t_pedido_item
        WHERE pedido_id = $1 AND active_flg = true
      `, [pedidoId])
      const itens = itensRes.rows

      // ── Transições que NÃO mexem em nada ────────────────────────────────
      // pendente, producao, pronto e cancelado apenas trocam o status.
      if (status !== 'entregue') {
        await client.query(
          `UPDATE t_pedido SET status = $1, updated_dt = NOW() WHERE pedido_id = $2`,
          [status, pedidoId]
        )
        return ok({ ok: true, status, pedidoId })
      }

      // ── ENTREGA: estoque + venda + conta a receber ──────────────────────
      if (itens.length === 0) {
        return badRequest('Pedido sem itens não pode ser entregue.')
      }

      // Confere estoque ANTES de abrir a transação, para avisar em vez de
      // zerar em silêncio. Estoque insuficiente aqui quase sempre significa
      // que a produção não foi registrada na grade.
      const insuficientes: { nome: string; precisa: number; tem: number }[] = []
      for (const it of itens) {
        const est = await client.query(
          `SELECT nome, estoque_atual::numeric AS estoque FROM t_produto WHERE produto_id = $1`,
          [it.produto_id]
        )
        const tem = Number(est.rows[0]?.estoque ?? 0)
        if (tem < Number(it.quantidade)) {
          insuficientes.push({
            nome:    est.rows[0]?.nome ?? it.nome_produto,
            precisa: Number(it.quantidade),
            tem,
          })
        }
      }

      const subtotal = itens.reduce((a: number, i: any) => a + Number(i.subtotal ?? 0), 0)
      const total    = subtotal + Number(pedido.valor_entrega ?? 0)

      // Nome que vai na conta a receber. Cliente cadastrado tem prioridade;
      // sem ele, vale o nome avulso digitado no pedido. A conta fica sem
      // cliente_id nesse caso — é o limite do avulso.
      const nomeCliente = String(pedido.cliente_fantasia ?? '').trim()
        || String(pedido.cliente_razao ?? '').trim()
        || String(pedido.nome_cliente_avulso ?? '').trim()
        || null

      // Vencimento = previsão de entrega. Sem previsão, vence hoje.
      // A data é editável depois em Financeiro → Contas a Receber.
      const venc = pedido.previsao_entrega
        ? new Date(pedido.previsao_entrega).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10)
      const hoje = new Date().toISOString().slice(0, 10)

      await client.query('BEGIN')
      try {
        // 1. Status
        await client.query(
          `UPDATE t_pedido SET status = 'entregue', updated_dt = NOW() WHERE pedido_id = $1`,
          [pedidoId]
        )

        // A VENDA NÃO NASCE AQUI.
        //
        // Antes, entregar criava a venda na mesma transação. O efeito era
        // faturamento aparecendo no relatório de um pedido que ainda não tinha
        // sido pago — e, se o cliente nunca pagasse, a venda continuava lá.
        //
        // Agora entrega e faturamento são momentos separados: a entrega move
        // mercadoria e abre a cobrança; a venda só existe quando o dinheiro
        // entra, na baixa da conta a receber (ContasReceberService.baixar).
        //
        // O insumo continua sem sair aqui: ele já saiu quando a produção foi
        // registrada na grade. Debitar de novo derrubaria o estoque pelo dobro
        // do que a fábrica consumiu.

        // 2. Estoque do produto acabado sai.
        for (const it of itens) {
          await client.query(`
            UPDATE t_produto
            SET estoque_atual = GREATEST(0, estoque_atual - $1), updated_dt = NOW()
            WHERE produto_id = $2 AND active_flg = true
          `, [it.quantidade, it.produto_id])

          // Movimentação, para o extrato do produto mostrar de onde veio a saída
          await client.query(`
            INSERT INTO t_movimentacao_estoque
              (tipo, entidade, entidade_id, quantidade, preco_custo, observacao,
               data_movimentacao, created_by, updated_by, created_dt, updated_dt, active_flg, modification_num)
            VALUES ('saida', 'produto', $1, $2, 0, $3, NOW(), 1, 1, NOW(), NOW(), true, 0)
          `, [it.produto_id, it.quantidade, `Entrega do pedido #${pedidoId}`])
        }

        // 3. Conta a receber. A forma de pagamento é informada na baixa, que é
        //    onde a taxa de cartão aparece — e é lá que a venda vai nascer.
        //    data_entrega registra quando a mercadoria saiu, que é diferente do
        //    vencimento e do recebimento.
        //
        //    totalParcelas > 1 divide o valor em N contas, uma por mês a partir
        //    do vencimento — mesmo cálculo do ContasReceberService.criar(), pra
        //    não ter dois jeitos diferentes de parcelar dentro do sistema.
        let primeiraContaId: number | null = null
        for (let i = 0; i < totalParcelas; i++) {
          const dtVenc = new Date(venc)
          dtVenc.setMonth(dtVenc.getMonth() + i)
          const vencParcela = dtVenc.toISOString().slice(0, 10)
          const valorParcela = Math.round(total / totalParcelas)
          const descParcela = totalParcelas > 1
            ? `Pedido #${pedidoId}${nomeCliente ? ' — ' + nomeCliente : ''} (${i + 1}/${totalParcelas})`
            : `Pedido #${pedidoId}${nomeCliente ? ' — ' + nomeCliente : ''}`

          const contaRes = await client.query(`
            INSERT INTO t_conta_receber (
              descricao, cliente_id, nome_cliente, categoria, numero_documento,
              valor_base, desconto, acrescimo,
              valor_original, valor_recebido, data_emissao, data_vencimento, data_entrega,
              status, observacao, origem, origem_id, parcela_atual, total_parcelas, conta_pai_id,
              created_by, updated_by, created_dt, updated_dt, active_flg, modification_num
            ) VALUES (
              $1, $2, $3, 'Venda', $4,
              $5, 0, 0,
              $5, 0, $6, $7, $8,
              'aberta', $9, 'pedido', $10, $11, $12, $13,
              1, 1, NOW(), NOW(), true, 0
            ) RETURNING conta_receber_id
          `, [
            descParcela,
            pedido.cliente_id,
            nomeCliente,
            `PED-${pedidoId}`,
            valorParcela,
            hoje,
            vencParcela,
            hoje,
            `Gerada na entrega do pedido #${pedidoId}.`,
            pedidoId,
            i + 1,
            totalParcelas,
            i > 0 ? primeiraContaId : null,
          ])
          if (i === 0) primeiraContaId = contaRes.rows[0].conta_receber_id
        }

        await client.query('COMMIT')

        // ── NOTA FISCAL — FORA DA TRANSAÇÃO, DEPOIS DO COMMIT ──────────────
        //
        // A NF-e do pedido nasce AQUI, na entrega, e não na baixa da conta a
        // receber. Mercadoria em trânsito precisa de documento: a própria
        // NF-e 3.313 da Zaghi saiu em 07/08 com duplicata para 28/08. Pendurar
        // a nota no pagamento faria a carga viajar sem DANFE.
        //
        // Fora da transação de propósito: o FiscalService usa outra conexão, e
        // uma falha fiscal não pode desfazer a entrega e o estoque que já
        // foram gravados. Se falhar, a entrega vale e a nota fica pendente.
        let notaId: number | null = null
        if (pedido.documento_fiscal !== 'nenhum' && !pedido.nota_id) {
          try {
            const { db, release } = await getDbForTenant(tenant.schemaName)
            try {
              const cfg = await new ConfiguracoesService(db).get()
              if (cfg?.fiscalAtivo) {
                const nota = await new FiscalService(db).criarNota({
                  tipo: pedido.documento_fiscal === 'nfce' ? 'NFC-e' : 'NF-e',
                  cnpjCpf:     pedido.cliente_documento ?? undefined,
                  razaoSocial: nomeCliente ?? undefined,
                  uf:          pedido.cliente_uf ?? undefined,
                  // Congela endereço e IE do destinatário: a NF-e modelo 55
                  // exige, e buscar depois traria o endereço de hoje numa
                  // nota de meses atrás.
                  clienteId:   pedido.cliente_id ?? undefined,
                  valorTotal:  total,
                  // produtoId vai junto: é por ele que o FiscalService acha o
                  // NCM e o perfil tributário do item.
                  itens: itens.map((i: any) => ({
                    produtoId:     i.produto_id,
                    descricao:     i.nome_produto,
                    quantidade:    Number(i.quantidade),
                    precoUnitario: Number(i.preco_unitario ?? 0),
                  })),
                  userId: 1,
                })
                notaId = (nota as any)?.notaId ?? (nota as any)?.nota_id ?? null
                if (notaId) {
                  await client.query(
                    `UPDATE t_pedido SET nota_id = $1, updated_dt = NOW() WHERE pedido_id = $2`,
                    [notaId, pedidoId])
                }
              }
            } finally { release() }
          } catch (_) {
            // Nota não criada: a entrega continua válida. O módulo Fiscal
            // mostra o pedido sem nota, e dá para gerar de lá.
          }
        }

        const aviso = insuficientes.length > 0
          ? ` Atenção: ${insuficientes.map(i => `${i.nome} (precisava ${i.precisa}, tinha ${i.tem})`).join('; ')}. O estoque desses produtos ficou zerado — confira se a produção foi registrada na grade.`
          : ''

        const avisoNota = pedido.documento_fiscal !== 'nenhum'
          ? (notaId ? ' Nota fiscal gerada — emita no módulo Fiscal.' : ' A nota não pôde ser gerada; verifique o módulo Fiscal.')
          : ''

        const msgConta = totalParcelas > 1
          ? `Conta a receber criada em ${totalParcelas}x, primeira parcela vencendo em ${venc.split('-').reverse().join('/')}.`
          : `Conta a receber criada com vencimento em ${venc.split('-').reverse().join('/')}.`

        return ok({
          ok: true,
          status: 'entregue',
          pedidoId,
          total,
          totalParcelas,
          notaId,
          vencimento: venc,
          insuficientes,
          message: `Entrega confirmada. ${msgConta}${avisoNota}${aviso}`,
        })
      } catch (err) {
        await client.query('ROLLBACK')
        throw err
      }
    } finally {
      client.release()
    }
  } catch (err) { return serverError(err) }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    await exigirModulo(tenant.schemaName, 'pedidos')
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      await new PedidoService(db).excluir(Number(params.id), 1)
      return ok({ deleted: true })
    } finally { release() }
  } catch (err) { return serverError(err) }
}