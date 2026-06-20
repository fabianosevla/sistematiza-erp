import { eq, and } from 'drizzle-orm'
import type { AppDB } from '@/lib/db/connection'
import { dbEntradaNfe, dbEntradaNfeItem } from '@/lib/db/schemas/estoque-avancado'
import { PedidoCompraService } from '@/lib/services/compras/PedidoCompraService'
import { ConferenciaService } from '@/lib/services/compras/ConferenciaService'

interface ItemNfeParsed {
  codigoXml: string
  descricaoXml: string
  ncm: string
  quantidade: number
  valorUnitario: number // centavos
  valorTotal: number    // centavos
}

interface NfeParsed {
  chaveAcesso: string
  numeroNfe: string
  nomeFornecedor: string
  cnpjFornecedor: string
  dataEmissao: string
  valorTotal: number // centavos
  itens: ItemNfeParsed[]
}

/**
 * EntradaNfeService — entrada de estoque via XML de NF-e.
 *
 * Parser por regex (estrutura da NFe é fixa/padronizada o suficiente pra
 * isso funcionar sem dependência nova). Se no futuro houver XMLs com
 * variações que quebrem o regex, vale trocar por uma lib tipo
 * fast-xml-parser — mas exige `npm install`.
 *
 * Ao confirmar, reaproveita o fluxo de Compras já existente: gera um
 * Pedido de Compra + Conferência já finalizada (entrada = já recebido),
 * o que automaticamente dá entrada no estoque dos insumos mapeados e gera
 * a Conta a Pagar — sem duplicar nenhuma lógica.
 */
export class EntradaNfeService {
  constructor(private db: AppDB) {}

  parseXml(xmlContent: string): NfeParsed {
    const get = (regex: RegExp, source = xmlContent) => source.match(regex)?.[1]?.trim() ?? ''

    const chaveAcesso = get(/Id="NFe(\d{44})"/)
    const numeroNfe    = get(/<nNF>(\d+)<\/nNF>/)
    const dataEmissaoRaw = get(/<dhEmi>([^<]+)<\/dhEmi>/) || get(/<dEmi>([^<]+)<\/dEmi>/)
    const dataEmissao  = dataEmissaoRaw ? dataEmissaoRaw.slice(0, 10) : ''

    const emitBlock = xmlContent.match(/<emit>([\s\S]*?)<\/emit>/)?.[1] ?? ''
    const cnpjFornecedor  = get(/<CNPJ>(\d+)<\/CNPJ>/, emitBlock)
    const nomeFornecedor  = get(/<xNome>([^<]+)<\/xNome>/, emitBlock)

    const totalBlock = xmlContent.match(/<ICMSTot>([\s\S]*?)<\/ICMSTot>/)?.[1] ?? ''
    const valorTotal  = Math.round(parseFloat(get(/<vNF>([\d.]+)<\/vNF>/, totalBlock) || '0') * 100)

    const detBlocks = [...xmlContent.matchAll(/<det[^>]*>([\s\S]*?)<\/det>/g)].map(m => m[1])
    const itens: ItemNfeParsed[] = detBlocks.map(block => {
      const prodBlock = block.match(/<prod>([\s\S]*?)<\/prod>/)?.[1] ?? block
      const quantidade    = parseFloat(get(/<qCom>([\d.]+)<\/qCom>/, prodBlock) || '0')
      const valorUnitario = Math.round(parseFloat(get(/<vUnCom>([\d.]+)<\/vUnCom>/, prodBlock) || '0') * 100)
      const valorTotalItem = Math.round(parseFloat(get(/<vProd>([\d.]+)<\/vProd>/, prodBlock) || '0') * 100)
      return {
        codigoXml:    get(/<cProd>([^<]+)<\/cProd>/, prodBlock),
        descricaoXml: get(/<xProd>([^<]+)<\/xProd>/, prodBlock),
        ncm:          get(/<NCM>([^<]+)<\/NCM>/, prodBlock),
        quantidade, valorUnitario, valorTotal: valorTotalItem,
      }
    })

    if (itens.length === 0) throw new Error('Não foi possível extrair itens do XML. Confira se é um arquivo de NF-e válido.')

    return { chaveAcesso, numeroNfe, nomeFornecedor, cnpjFornecedor, dataEmissao, valorTotal, itens }
  }

  /** Salva a NF-e parseada com status 'pendente' — aguardando mapeamento de insumos */
  async criar(parsed: NfeParsed, userId: number) {
    const now = new Date()
    const [entrada] = await this.db.insert(dbEntradaNfe).values({
      chaveAcesso: parsed.chaveAcesso, numeroNfe: parsed.numeroNfe,
      nomeFornecedor: parsed.nomeFornecedor, cnpjFornecedor: parsed.cnpjFornecedor,
      dataEmissao: parsed.dataEmissao || now.toISOString().slice(0, 10),
      valorTotal: parsed.valorTotal, status: 'pendente',
      createdBy: userId, updatedBy: userId, createdDt: now, updatedDt: now,
    }).returning({ entradaId: dbEntradaNfe.entradaId })

    for (const item of parsed.itens) {
      await this.db.insert(dbEntradaNfeItem).values({
        entradaId: entrada.entradaId, codigoXml: item.codigoXml, descricaoXml: item.descricaoXml,
        ncm: item.ncm, quantidade: String(item.quantidade), valorUnitario: item.valorUnitario, valorTotal: item.valorTotal,
        createdBy: userId, updatedBy: userId, createdDt: now, updatedDt: now,
      })
    }
    return entrada
  }

  async findById(id: number) {
    const [entrada] = await this.db.select().from(dbEntradaNfe).where(eq(dbEntradaNfe.entradaId, id))
    if (!entrada) return null
    const itens = await this.db.select().from(dbEntradaNfeItem)
      .where(and(eq(dbEntradaNfeItem.entradaId, id), eq(dbEntradaNfeItem.activeFlag, true)))
    return { ...entrada, itens }
  }

  async list({ status }: { status?: string } = {}) {
    const conds = [eq(dbEntradaNfe.activeFlag, true)]
    if (status && status !== 'todas') conds.push(eq(dbEntradaNfe.status, status))
    return this.db.select().from(dbEntradaNfe).where(and(...conds)).orderBy(dbEntradaNfe.dataEmissao)
  }

  /** Mapeia um item do XML pro insumo correspondente no cadastro */
  async mapearItem(itemId: number, insumoId: number, userId: number) {
    await this.db.update(dbEntradaNfeItem).set({ insumoId, updatedDt: new Date(), updatedBy: userId })
      .where(eq(dbEntradaNfeItem.itemId, itemId))
    return { ok: true }
  }

  /**
   * Confirma a entrada: todos os itens precisam estar mapeados pra um
   * insumo. Gera um Pedido de Compra + Conferência já finalizada (entrada
   * de NF-e significa que a mercadoria já chegou de fato), o que dá
   * entrada automática no estoque e gera a Conta a Pagar — reaproveitando
   * o fluxo de Compras inteiro, sem duplicar lógica.
   */
  async confirmar(entradaId: number, userId: number) {
    const entrada = await this.findById(entradaId)
    if (!entrada) throw new Error('Entrada não encontrada')

    const naoMapeados = entrada.itens.filter(i => !i.insumoId)
    if (naoMapeados.length > 0) {
      throw new Error(`${naoMapeados.length} item(ns) ainda não foram vinculados a um insumo.`)
    }

    const pedidoSvc = new PedidoCompraService(this.db)
    const pedido = await pedidoSvc.criar({
      nomeFornecedor: entrada.nomeFornecedor || 'Fornecedor (NF-e)',
      observacao: `Gerado automaticamente da NF-e nº ${entrada.numeroNfe} (chave ${entrada.chaveAcesso})`,
      itens: entrada.itens.map(i => ({
        insumoId: i.insumoId!, nomeInsumo: i.descricaoXml,
        quantidade: Number(i.quantidade), precoUnitario: i.valorUnitario / 100,
      })),
      userId,
    })

    const confSvc = new ConferenciaService(this.db)
    const conferencia = await confSvc.iniciar(pedido.pedidoId, userId)

    // Lança a quantidade total recebida = quantidade da nota (recebimento integral)
    const confDetail = await confSvc.findById(conferencia.conferenciaId)
    for (const item of confDetail!.itens) {
      await confSvc.lancarItem(item.itemId, Number(item.quantidadePedida), userId)
    }
    const resultado = await confSvc.finalizar(conferencia.conferenciaId, { gerarContaPagar: true }, userId)

    await this.db.update(dbEntradaNfe).set({
      status: 'processada', pedidoId: pedido.pedidoId, updatedDt: new Date(), updatedBy: userId,
    }).where(eq(dbEntradaNfe.entradaId, entradaId))

    return { pedidoId: pedido.pedidoId, ...resultado }
  }
}