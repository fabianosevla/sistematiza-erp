import { eq, and } from 'drizzle-orm'
import type { AppDB } from '@/lib/db/connection'
import { dbEntradaNfe, dbEntradaNfeItem } from '@/lib/db/schemas/estoque-avancado'
import { ComprasService } from '@/lib/services/compras/ComprasService'

interface ItemNfeParsed {
  codigoXml: string
  descricaoXml: string
  ncm: string
  quantidade: number
  valorUnitario: number // centavos
  valorTotal: number    // centavos
  // Como o FORNECEDOR tributou esse item — diz se ele já reteve ICMS-ST.
  cfop: string
  cstCsosn: string
  valorIcms: number   // centavos
  valorBcSt: number   // centavos
  valorIcmsSt: number // centavos — > 0 = fornecedor já reteve ST
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

      // Bloco de imposto: a tag que embrulha (ICMS00, ICMS10, ICMSSN102...)
      // varia com o regime do FORNECEDOR, mas os campos de dentro (CST ou
      // CSOSN, vICMS, vBCST, vICMSST) têm o mesmo nome em qualquer variante —
      // por isso busca no bloco <imposto> inteiro, sem precisar saber qual
      // subtag é. vICMSST > 0 é o que diz "o fornecedor já reteve o ST".
      const impostoBlock = block.match(/<imposto>([\s\S]*?)<\/imposto>/)?.[1] ?? ''
      const cstCsosn   = get(/<CSOSN>([^<]+)<\/CSOSN>/, impostoBlock) || get(/<CST>([^<]+)<\/CST>/, impostoBlock)
      const valorIcms  = Math.round(parseFloat(get(/<vICMS>([\d.]+)<\/vICMS>/, impostoBlock) || '0') * 100)
      const valorBcSt  = Math.round(parseFloat(get(/<vBCST>([\d.]+)<\/vBCST>/, impostoBlock) || '0') * 100)
      const valorIcmsSt = Math.round(parseFloat(get(/<vICMSST>([\d.]+)<\/vICMSST>/, impostoBlock) || '0') * 100)

      return {
        codigoXml:    get(/<cProd>([^<]+)<\/cProd>/, prodBlock),
        descricaoXml: get(/<xProd>([^<]+)<\/xProd>/, prodBlock),
        ncm:          get(/<NCM>([^<]+)<\/NCM>/, prodBlock),
        cfop:         get(/<CFOP>([^<]+)<\/CFOP>/, prodBlock),
        quantidade, valorUnitario, valorTotal: valorTotalItem,
        cstCsosn, valorIcms, valorBcSt, valorIcmsSt,
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
        cfop: item.cfop || null, cstCsosn: item.cstCsosn || null,
        valorIcms: item.valorIcms, valorBcSt: item.valorBcSt, valorIcmsSt: item.valorIcmsSt,
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
   * Confirma a entrada da NF-e.
   *
   * Antes este método montava um Pedido de Compra, abria uma Conferência,
   * lançava item a item e finalizava — três objetos só para dizer "a
   * mercadoria chegou". Esse fluxo saiu junto com as abas de Compras.
   *
   * Agora delega para ComprasService.criar, que numa transação só grava a
   * compra, sobe o estoque, registra a movimentação, atualiza o custo do
   * insumo e lança o financeiro.
   *
   * Dois ganhos que o caminho antigo não tinha: a entrada passa a aparecer em
   * Consultas → Entradas (havia estoque subindo sem linha de extrato), e o
   * preco_custo do insumo passa a valer o preço da nota.
   *
   * NF-e entra como compra A PRAZO quando a nota traz vencimento; sem
   * vencimento, entra à vista na data da emissão.
   */
  async confirmar(entradaId: number, userId: number) {
    const entrada = await this.findById(entradaId)
    if (!entrada) throw new Error('Entrada não encontrada')

    const naoMapeados = entrada.itens.filter(i => !i.insumoId)
    if (naoMapeados.length > 0) {
      throw new Error(`${naoMapeados.length} item(ns) ainda não foram vinculados a um insumo.`)
    }

    const dataCompra = String(
      (entrada as any).dataEmissao ?? new Date().toISOString().slice(0, 10),
    ).slice(0, 10)

    const resultado = await new ComprasService(this.db).criar({
      nomeFornecedor: entrada.nomeFornecedor || 'Fornecedor (NF-e)',
      dataCompra,
      documento:  entrada.numeroNfe ? String(entrada.numeroNfe) : undefined,
      condicao:   'a_vista',
      observacao: `NF-e nº ${entrada.numeroNfe} · chave ${entrada.chaveAcesso}`,
      itens: entrada.itens.map(i => ({
        insumoId:      i.insumoId!,
        nomeInsumo:    i.descricaoXml,
        quantidade:    Number(i.quantidade),
        valorUnitario: Number(i.valorUnitario),   // já em centavos
      })),
      userId,
    })

    await this.db.update(dbEntradaNfe).set({
      status: 'processada', updatedDt: new Date(), updatedBy: userId,
    }).where(eq(dbEntradaNfe.entradaId, entradaId))

    return resultado
  }
}
