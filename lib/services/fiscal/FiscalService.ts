import { and, eq, desc, gte, lte, sql } from 'drizzle-orm'
import type { AppDB } from '@/lib/db/connection'
import { dbNotaFiscal, dbNotaFiscalItem, dbTurnoCaixa } from '@/lib/db/schemas/fiscal'
import { dbConfiguracoesTenant } from '@/lib/db/schemas/vendas'

/**
 * Grupo de ST do item, no formato que a Focus NFe espera.
 *
 * Só sai quando houve ST calculada. Item sem ST não pode levar o grupo vazio:
 * a SEFAZ recusa tanto por falta quanto por excesso.
 *
 * Modalidade 4 = Margem de Valor Agregado, que é como MG trata a massa.
 */
function grupoSt(item: any) {
  const base = Number(item.baseSt ?? 0)
  if (base <= 0) return {}
  return {
    icms_modalidade_base_calculo_st: '4',
    icms_margem_valor_adicionado_st: String(Number(item.mva ?? 0)),
    icms_base_calculo_st:            (base / 100).toFixed(2),
    icms_aliquota_st:                String(Number(item.aliqSt ?? 0)),
    icms_valor_st:                   (Number(item.valorSt ?? 0) / 100).toFixed(2),
  }
}

/**
 * Nome da forma de pagamento → código tPag da NF-e.
 *
 * O que não casa vira 99 (outros), que é verdadeiro. Mapear para 01 seria
 * declarar dinheiro que não entrou, e o cruzamento com a operadora não bate.
 */
function codigoFormaPagamento(nome: any): string {
  const n = String(nome ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  if (/dinheiro|especie/.test(n))          return '01'
  if (/cheque/.test(n))                    return '02'
  if (/debito/.test(n))                    return '04'
  if (/credito|cartao/.test(n))            return '03'
  if (/vale.*aliment/.test(n))             return '10'
  if (/vale.*refei/.test(n))               return '11'
  if (/boleto/.test(n))                    return '15'
  if (/deposito/.test(n))                  return '16'
  if (/pix/.test(n))                       return '17'
  if (/transfer/.test(n))                  return '18'
  if (/fidelidade|cashback/.test(n))       return '19'
  return '99'
}

export class FiscalService {
  constructor(private db: AppDB) {}

  // ── Turno de Caixa ────────────────────────────────────────────────────────

  async getTurnoAberto() {
    const [turno] = await this.db
      .select().from(dbTurnoCaixa)
      .where(and(eq(dbTurnoCaixa.status, 'aberto'), eq(dbTurnoCaixa.activeFlag, true)))
      .orderBy(desc(dbTurnoCaixa.abertoEm)).limit(1)
    return turno ?? null
  }

  async abrirTurno({ operador, numeroCaixa, valorAbertura, userId }: {
    operador: string; numeroCaixa: number; valorAbertura: number; userId: number
  }) {
    const now = new Date()
    const aberto = await this.getTurnoAberto()
    if (aberto) throw new Error('Já existe um turno de caixa aberto')
    const [result] = await this.db.insert(dbTurnoCaixa).values({
      operador, numeroCaixa, valorAbertura, abertoEm: now, status: 'aberto',
      createdBy: userId, updatedBy: userId, createdDt: now, updatedDt: now,
    }).returning({ turnoId: dbTurnoCaixa.turnoId })
    return result
  }

  /**
   * O que passou pelo caixa desde a abertura do turno.
   *
   * Sem isto o fechamento seria um campo de valor solto: o operador digitaria
   * quanto tem na gaveta sem nada com que comparar. Aqui ele vê o esperado —
   * abertura mais o que entrou em dinheiro — e a diferença aparece sozinha.
   *
   * Só DINHEIRO conta para a gaveta. Cartão e PIX não passam por ela, então
   * somá-los criaria uma diferença que não existe.
   */
  async resumoTurno(turnoId: number) {
    const [turno] = await this.db.select().from(dbTurnoCaixa)
      .where(eq(dbTurnoCaixa.turnoId, turnoId))
    if (!turno) return null

    const r = await this.db.execute(sql`
      SELECT vp.forma,
             COUNT(DISTINCT v.venda_id)::int AS vendas,
             COALESCE(SUM(vp.valor), 0)::int AS total
        FROM t_venda v
        JOIN t_venda_pagamento vp ON vp.venda_id = v.venda_id AND vp.active_flg = true
       WHERE v.active_flg = true
         AND v.vendida_em >= ${turno.abertoEm}
         AND (${turno.fechadoEm}::timestamptz IS NULL OR v.vendida_em <= ${turno.fechadoEm})
       GROUP BY vp.forma
       ORDER BY vp.forma
    `)

    const formas = (r.rows as any[]).map(x => ({
      forma:  x.forma,
      vendas: Number(x.vendas),
      total:  Number(x.total),
    }))

    // "Dinheiro" é o nome cadastrado na forma de pagamento. A comparação é
    // frouxa de propósito: cada cliente cadastra o nome que quiser.
    const emDinheiro = formas
      .filter(f => /dinheiro|especie|espécie/i.test(f.forma))
      .reduce((a, f) => a + f.total, 0)

    return {
      turno,
      formas,
      totalVendido:    formas.reduce((a, f) => a + f.total, 0),
      emDinheiro,
      esperadoGaveta:  turno.valorAbertura + emDinheiro,
    }
  }

  async fecharTurno({ turnoId, valorFechamento, observacao, userId }: {
    turnoId: number; valorFechamento: number; observacao?: string; userId: number
  }) {
    const now = new Date()
    await this.db.update(dbTurnoCaixa).set({
      status: 'fechado', valorFechamento, fechadoEm: now,
      observacao: observacao ?? null, updatedDt: now, updatedBy: userId,
    }).where(eq(dbTurnoCaixa.turnoId, turnoId))
    return { ok: true }
  }

  // ── Notas Fiscais ─────────────────────────────────────────────────────────

  async listNotas({ tipo, status, dataInicio, dataFim }: {
    tipo?: string; status?: string; dataInicio?: string; dataFim?: string
  }) {
    const conditions = [eq(dbNotaFiscal.activeFlag, true)]
    if (tipo)       conditions.push(eq(dbNotaFiscal.tipo, tipo))
    if (status)     conditions.push(eq(dbNotaFiscal.status, status))
    if (dataInicio) conditions.push(gte(dbNotaFiscal.dataEmissao, new Date(dataInicio)))
    if (dataFim)    conditions.push(lte(dbNotaFiscal.dataEmissao, new Date(dataFim)))
    return this.db.select().from(dbNotaFiscal).where(and(...conditions))
      .orderBy(desc(dbNotaFiscal.dataEmissao))
  }

  async findNotaById(id: number) {
    const [nota] = await this.db.select().from(dbNotaFiscal).where(eq(dbNotaFiscal.notaId, id))
    if (!nota) return null
    const itens = await this.db.select().from(dbNotaFiscalItem)
      .where(eq(dbNotaFiscalItem.notaId, id))
    return { ...nota, itens }
  }

  /**
   * Cria o rascunho da nota, JÁ COM A TRIBUTAÇÃO RESOLVIDA.
   *
   * A resolução acontece aqui, e não na hora de emitir, de propósito: nota é
   * documento, e documento retrata o momento em que foi feito. Se o contador
   * mudar o perfil de um produto amanhã, as notas de ontem continuam contando
   * a história que era verdade ontem.
   *
   * O que NÃO acontece aqui: inventar valor que falta. Item sem NCM ou sem
   * perfil é gravado com o campo vazio, e a emissão recusa depois. Preencher
   * com um padrão plausível — CFOP 5102, CSOSN 102 — produziria nota
   * autorizada com tributação que ninguém escolheu, e isso não dá erro: dá
   * autuação, meses depois.
   */
  async criarNota(payload: {
    tipo: string; cnpjCpf?: string; razaoSocial?: string; uf?: string
    cfop?: string; valorTotal: number; vendaId?: number
    /** Congela o endereço do destinatário, exigido na NF-e modelo 55. */
    clienteId?: number
    // `descontoItem`: em centavos, já soma o desconto da linha (item) com a
    // fatia proporcional do desconto geral da venda (cabeçalho). Sem isso, a
    // soma dos itens da nota ficava maior que valorTotal/formas_pagamento —
    // a Focus rejeita essa divergência ("total dos pagamentos inferior ao
    // valor total da nota").
    itens: { produtoId?: number; descricao: string; quantidade: number; precoUnitario: number; descontoItem?: number }[]
    userId: number
  }) {
    const now = new Date()
    const subtotal = payload.itens.reduce((a, i) => a + (i.precoUnitario * i.quantidade - (i.descontoItem ?? 0)), 0)

    // UF do destinatário decide entre CFOP interno e interestadual.
    const cfgRes = await this.db.execute(sql`
      SELECT uf, crt FROM t_configuracoes_tenant LIMIT 1
    `)
    const cfg: any = (cfgRes.rows as any[])[0] ?? {}
    const ufEmpresa = String(cfg.uf ?? '').toUpperCase()
    const ufDestino = String(payload.uf ?? ufEmpresa).toUpperCase()
    const dentroDoEstado = !ufDestino || ufDestino === ufEmpresa
    const simples = ['1', '2'].includes(String(cfg.crt ?? ''))

    // NFC-e é sempre venda a consumidor final. NF-e é a contribuinte só
    // quando o destinatário tem CNPJ — mesma regra usada em emitirViaFocusNfe
    // para natureza da operação. CFOP e CSOSN mudam entre os dois casos, por
    // isso o produto carrega dois perfis (ver ARMADILHAS no CLAUDE.md).
    const ehNfce = String(payload.tipo).toUpperCase() === 'NFC-E'
    const ehParaContribuinte = !ehNfce && !!payload.cnpjCpf

    // Endereço do destinatário, congelado agora. Buscar na hora de emitir
    // faria uma nota de agosto sair com o endereço que o cliente passou a ter
    // em outubro.
    let dest: any = {}
    if (payload.clienteId) {
      const r = await this.db.execute(sql`
        SELECT cep, endereco, numero, complemento, bairro, cidade, uf,
               inscricao_estadual, indicador_ie
          FROM t_cliente WHERE cliente_id = ${payload.clienteId} LIMIT 1
      `)
      dest = (r.rows as any[])[0] ?? {}
    }

    const [nota] = await this.db.insert(dbNotaFiscal).values({
      tipo: payload.tipo, status: 'pendente', dataEmissao: now,
      cnpjCpf: payload.cnpjCpf ?? null, razaoSocial: payload.razaoSocial ?? null,
      uf: payload.uf ?? dest.uf ?? null, cfop: payload.cfop ?? null,
      ie:          dest.inscricao_estadual ?? null,
      // 1 contribuinte · 2 isento · 9 não contribuinte. Sem cadastro, 9 é a
      // suposição segura: consumidor comum.
      indicadorIe: dest.indicador_ie ?? '9',
      cep:         dest.cep ?? null,
      logradouro:  dest.endereco ?? null,
      numeroDest:  dest.numero ?? null,
      complemento: dest.complemento ?? null,
      bairro:      dest.bairro ?? null,
      municipio:   dest.cidade ?? null,
      valorProdutos: subtotal, valorTotal: payload.valorTotal,
      vendaId: payload.vendaId ?? null,
      createdBy: payload.userId, updatedBy: payload.userId, createdDt: now, updatedDt: now,
    }).returning({ notaId: dbNotaFiscal.notaId })

    for (const item of payload.itens) {
      // Busca o que o contador parametrizou. Sem produtoId — item avulso
      // digitado à mão — os campos ficam vazios e a emissão vai reclamar.
      let fiscal: any = {}
      if (item.produtoId) {
        // Dois perfis possíveis por produto: pt1 (venda a contribuinte) e
        // pt2 (consumidor final). Busca os dois e escolhe pelo tipo da nota
        // — não dá pra decidir isso com uma coluna só, CFOP e CSOSN mudam.
        const r = await this.db.execute(sql`
          SELECT p.ncm, p.cest, p.origem, p.unidade_tributavel,
                 pt1.cfop_interno AS c_cfop_interno, pt1.cfop_interestadual AS c_cfop_interestadual,
                 pt1.csosn AS c_csosn, pt1.cst_icms AS c_cst_icms, pt1.aliq_icms AS c_aliq_icms,
                 pt1.cst_pis AS c_cst_pis, pt1.aliq_pis AS c_aliq_pis, pt1.cst_cofins AS c_cst_cofins, pt1.aliq_cofins AS c_aliq_cofins,
                 pt1.cst_ipi AS c_cst_ipi, pt1.aliq_ipi AS c_aliq_ipi, pt1.tem_st AS c_tem_st, pt1.mva AS c_mva, pt1.aliq_icms_st AS c_aliq_icms_st,
                 pt2.cfop_interno AS cf_cfop_interno, pt2.cfop_interestadual AS cf_cfop_interestadual,
                 pt2.csosn AS cf_csosn, pt2.cst_icms AS cf_cst_icms, pt2.aliq_icms AS cf_aliq_icms,
                 pt2.cst_pis AS cf_cst_pis, pt2.aliq_pis AS cf_aliq_pis, pt2.cst_cofins AS cf_cst_cofins, pt2.aliq_cofins AS cf_aliq_cofins,
                 pt2.cst_ipi AS cf_cst_ipi, pt2.aliq_ipi AS cf_aliq_ipi, pt2.tem_st AS cf_tem_st, pt2.mva AS cf_mva, pt2.aliq_icms_st AS cf_aliq_icms_st
            FROM t_produto p
            LEFT JOIN t_perfil_tributario pt1 ON pt1.perfil_trib_id = p.perfil_trib_id
            LEFT JOIN t_perfil_tributario pt2 ON pt2.perfil_trib_id = p.perfil_trib_consumidor_final_id
           WHERE p.produto_id = ${item.produtoId}
           LIMIT 1
        `)
        const row = (r.rows as any[])[0] ?? {}
        const pfx = ehParaContribuinte ? 'c_' : 'cf_'
        fiscal = {
          ncm: row.ncm, cest: row.cest, origem: row.origem, unidade_tributavel: row.unidade_tributavel,
          cfop_interno:       row[`${pfx}cfop_interno`],
          cfop_interestadual: row[`${pfx}cfop_interestadual`],
          csosn:      row[`${pfx}csosn`],
          cst_icms:   row[`${pfx}cst_icms`],
          aliq_icms:  row[`${pfx}aliq_icms`],
          cst_pis:    row[`${pfx}cst_pis`],
          aliq_pis:   row[`${pfx}aliq_pis`],
          cst_cofins: row[`${pfx}cst_cofins`],
          aliq_cofins:row[`${pfx}aliq_cofins`],
          cst_ipi:    row[`${pfx}cst_ipi`],
          aliq_ipi:   row[`${pfx}aliq_ipi`],
          tem_st:     row[`${pfx}tem_st`],
          mva:        row[`${pfx}mva`],
          aliq_icms_st: row[`${pfx}aliq_icms_st`],
        }
      }

      const cfop = dentroDoEstado ? fiscal.cfop_interno : fiscal.cfop_interestadual
      const valorTotal = Math.max(0, item.precoUnitario * item.quantidade - (item.descontoItem ?? 0))
      const aliqIcms = Number(fiscal.aliq_icms ?? 0)

      // ── SUBSTITUIÇÃO TRIBUTÁRIA ──────────────────────────────────────────
      //
      // O perfil guardava MVA e alíquota e nada disso chegava na nota: a
      // emissão saía sem o grupo de ST, que a SEFAZ exige quando o CSOSN é
      // 201. Rejeição na certa.
      //
      // A conta reproduz exatamente a NF-e 3.313 do Everest:
      //   base ST = valor × (1 + MVA)        1.317,00 × 1,35 = 1.777,95 ✓
      //   ST      = base × alíq − valor × alíq
      //             1.777,95 × 18% − 1.317,00 × 18% = 82,97   (DANFE: 82,98,
      //             diferença de arredondamento por item)
      //
      // A dedução usa a mesma alíquota interna como "ICMS próprio presumido",
      // que é o tratamento do Simples em MG. O contador precisa confirmar —
      // está anotado no kit.
      const temSt   = fiscal.tem_st === true
      const mva     = temSt ? Number(fiscal.mva ?? 0) : 0
      const aliqSt  = temSt ? Number(fiscal.aliq_icms_st ?? 0) : 0
      const baseSt  = temSt ? Math.round(valorTotal * (1 + mva / 100)) : 0
      const valorSt = temSt
        ? Math.max(0, Math.round(baseSt * aliqSt / 100) - Math.round(valorTotal * aliqSt / 100))
        : 0

      await this.db.insert(dbNotaFiscalItem).values({
        notaId: nota.notaId,
        produtoId: item.produtoId ?? null,
        descricao: item.descricao,
        quantidade: String(item.quantidade),
        precoUnitario: item.precoUnitario,
        valorTotal,
        ncm:  fiscal.ncm  ?? null,
        cfop: cfop ?? null,
        unidade: fiscal.unidade_tributavel ?? null,
        // No Simples vale o CSOSN; no regime normal, o CST. Guardar o que não
        // se aplica só confundiria quem for conferir a nota depois.
        cstCsosn: (simples ? fiscal.csosn : fiscal.cst_icms) ?? null,
        aliqIcms: String(aliqIcms),
        valorIcms: Math.round(valorTotal * aliqIcms / 100),
        aliqIpi: String(fiscal.aliq_ipi ?? 0),
        baseSt, valorSt, mva: String(mva), aliqSt: String(aliqSt),
        // PIS e COFINS vêm do perfil. Antes a emissão mandava '07' — isento —
        // para todo item, e alimento com alíquota zero saía igual a alimento
        // tributado. Ninguém percebia, porque a nota era autorizada do mesmo
        // jeito.
        cstPis:      fiscal.cst_pis    ?? null,
        aliqPis:     String(fiscal.aliq_pis ?? 0),
        valorPis:    Math.round(valorTotal * Number(fiscal.aliq_pis ?? 0) / 100),
        cstCofins:   fiscal.cst_cofins ?? null,
        aliqCofins:  String(fiscal.aliq_cofins ?? 0),
        valorCofins: Math.round(valorTotal * Number(fiscal.aliq_cofins ?? 0) / 100),
        origem:      fiscal.origem ?? '0',
        cest:        fiscal.cest   ?? null,
        createdBy: payload.userId, updatedBy: payload.userId, createdDt: now, updatedDt: now,
      })
    }
    return { notaId: nota.notaId }
  }

  /**
   * FORMAS DE PAGAMENTO REAIS.
   *
   * A emissão mandava sempre `01` — dinheiro — qualquer que fosse o meio
   * cobrado. Numa NFC-e isso é declarar ao fisco que a loja recebeu em
   * espécie quando recebeu em cartão, e o cruzamento com a operadora não bate.
   *
   * Sem venda vinculada (nota digitada à mão) não há o que consultar, e aí o
   * dinheiro é o padrão honesto: 99 "outros" também serviria, mas esconde.
   */
  private async formasDePagamento(nota: any) {
    const total = (nota.valorTotal / 100).toFixed(2)
    if (!nota.vendaId) return [{ forma_pagamento: '01', valor_pagamento: total }]

    try {
      const r = await this.db.execute(sql`
        SELECT forma, valor FROM t_venda_pagamento
         WHERE venda_id = ${nota.vendaId} AND active_flg = true
      `)
      const linhas = r.rows as any[]
      if (linhas.length === 0) return [{ forma_pagamento: '01', valor_pagamento: total }]
      return linhas.map(l => ({
        forma_pagamento: codigoFormaPagamento(l.forma),
        valor_pagamento: (Number(l.valor ?? 0) / 100).toFixed(2),
      }))
    } catch {
      return [{ forma_pagamento: '01', valor_pagamento: total }]
    }
  }

  /**
   * Emite a nota pelo emissor configurado no tenant.
   *
   * O nome ainda diz "Focus" por compatibilidade com quem chama; o método já
   * não sabe qual fornecedor é. Renomear fica para quando não houver mais
   * chamada antiga por aí.
   */
  async emitirViaFocusNfe(notaId: number, config: { token: string; ambiente: string }) {
    const nota = await this.findNotaById(notaId)
    if (!nota) throw new Error('Nota não encontrada')

    const baseUrl = config.ambiente === 'producao'
      ? 'https://api.focusnfe.com.br'
      : 'https://homologacao.focusnfe.com.br'

    // Identificador desta emissão no nosso sistema. Serve para consultar e
    // para não emitir duas vezes por engano.
    const ref = `sistematiza_${notaId}_${Date.now()}`

    // RECUSA ANTES DE EMITIR.
    //
    // A versao anterior completava o que faltava: NCM '00000000', CFOP '5102',
    // CSOSN '102', PIS e COFINS '07'. O NCM invalido ao menos era rejeitado
    // pela SEFAZ. Os outros passavam — e nota autorizada com tributacao que
    // ninguem escolheu nao da erro, da autuacao meses depois.
    //
    // Agora nada e completado. Falta informacao, a emissao para aqui e diz
    // exatamente qual item e qual campo.
    const faltando: string[] = []
    for (const item of nota.itens) {
      const f: string[] = []
      if (!item.ncm)      f.push('NCM')
      if (!item.cfop)     f.push('CFOP')
      if (!item.cstCsosn) f.push('CSOSN/CST')
      if (f.length > 0)   faltando.push(`${item.descricao}: sem ${f.join(', ')}`)
    }
    if (faltando.length > 0) {
      throw new Error(
        'Nao e possivel emitir: falta parametrizacao fiscal.\n' + faltando.join('\n') +
        '\nCadastre em Fiscal > Perfis tributarios e no cadastro do produto.'
      )
    }

    // Dados da empresa. Sem CRT nao da para decidir entre CSOSN e CST, e sem
    // saber isso o payload sai errado de um jeito que a SEFAZ aceita.
    const cfgRes = await this.db.execute(sql`
      SELECT crt, mensagem_fiscal, credenciado_nfce, credenciado_nfe, uf, cnpj
        FROM t_configuracoes_tenant LIMIT 1
    `)
    const cfg: any = (cfgRes.rows as any[])[0] ?? {}
    if (!String(cfg.crt ?? '').trim()) {
      throw new Error('Regime tributario (CRT) nao configurado. Preencha em Configuracoes > Fiscal.')
    }
    if (!String(cfg.cnpj ?? '').replace(/\D/g, '')) {
      throw new Error('CNPJ da empresa nao configurado. Preencha em Configuracoes > Dados da empresa.')
    }
    const ufEmpresaAtual = String(cfg.uf ?? '').toUpperCase()

    // CREDENCIAMENTO ANTES DE TRANSMITIR.
    //
    // Sem credenciamento na SEFAZ a transmissao falha — mas falha com um codigo
    // de rejeicao que ninguem no balcao vai entender. Barrar aqui devolve uma
    // frase que diz o que fazer.
    const ehNfce = String(nota.tipo).toUpperCase() === 'NFC-E'
    if (ehNfce && !cfg.credenciado_nfce) {
      throw new Error('Empresa nao credenciada para NFC-e na SEFAZ. Confirme em Configuracoes > Fiscal.')
    }
    if (!ehNfce && !cfg.credenciado_nfe) {
      throw new Error('Empresa nao credenciada para NF-e na SEFAZ. Confirme em Configuracoes > Fiscal.')
    }

    // ── NATUREZA DA OPERAÇÃO E TIPO DE COMPRADOR ──────────────────────────
    //
    // Estava tudo fixo em "VENDA A CONSUMIDOR", presença 4 (entrega a
    // domicílio) e consumidor final 1. Isso descreve o balcão, e descreve
    // errado a venda por pedido: a NF-e 3.313 da Zaghi sai como "Venda de
    // produção do estabelecimento", para um comprador que é contribuinte.
    //
    // Quem tem CNPJ na nota é empresa comprando para revenda; quem não tem é
    // consumidor final. A distinção muda três campos e o CFOP no perfil.
    const ehParaContribuinte = !ehNfce && !!nota.cnpjCpf
    const natureza = ehParaContribuinte
      ? 'Venda de producao do estabelecimento'
      : 'VENDA A CONSUMIDOR'

    // Em homologação a SEFAZ exige que o destinatário se chame exatamente
    // isto. Mandar o nome real derruba a nota, com um código que não explica.
    const RAZAO_HOMOLOGACAO = 'NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL'
    const homologacao = config.ambiente !== 'producao'

    const soDigitos = (v: any) => String(v ?? '').replace(/\D/g, '')
    const doc         = soDigitos(nota.cnpjCpf)
    const mesmoEstado = !nota.uf || String(nota.uf).toUpperCase() === ufEmpresaAtual

    // Na NF-e o destinatário é obrigatório, e faltar campo aqui devolve um
    // código de rejeição que ninguém decifra. Melhor barrar com o nome do
    // campo em português.
    if (!ehNfce) {
      const obrig: [string, any][] = [
        ['CNPJ/CPF',   doc],
        ['logradouro', (nota as any).logradouro],
        ['bairro',     (nota as any).bairro],
        ['município',  (nota as any).municipio],
        ['UF',         nota.uf],
        ['CEP',        (nota as any).cep],
      ]
      const semDados = obrig.filter(([, v]) => !String(v ?? '').trim()).map(([k]) => k)
      if (semDados.length > 0) {
        throw new Error(
          `Nao e possivel emitir NF-e: falta ${semDados.join(', ')} do destinatario.\n` +
          'Complete o cadastro do cliente em Cadastros > Clientes e gere a nota de novo.'
        )
      }
    }

    // ── DESTINATÁRIO ──────────────────────────────────────────────────────
    //
    // Só CNPJ e razão social não bastam na NF-e modelo 55: a SEFAZ exige o
    // endereço inteiro e o indicador de IE. Na NFC-e o destinatário é
    // opcional, e mandar endereço de consumidor de balcão só cria erro.
    //
    // Nome do campo é `nome_destinatario`, e não `razao_social_destinatario`.
    let destinatario: Record<string, any> = {}
    if (doc) {
      destinatario = {
        nome_destinatario: homologacao ? RAZAO_HOMOLOGACAO : nota.razaoSocial,
        ...(doc.length > 11 ? { cnpj_destinatario: doc } : { cpf_destinatario: doc }),
      }
      if (!ehNfce) {
        Object.assign(destinatario, {
          indicador_inscricao_estadual_destinatario: Number((nota as any).indicadorIe ?? 9),
          ...((nota as any).ie ? { inscricao_estadual_destinatario: soDigitos((nota as any).ie) } : {}),
          logradouro_destinatario: (nota as any).logradouro ?? '',
          numero_destinatario:     (nota as any).numeroDest || 'S/N',
          ...((nota as any).complemento ? { complemento_destinatario: (nota as any).complemento } : {}),
          bairro_destinatario:     (nota as any).bairro ?? '',
          municipio_destinatario:  (nota as any).municipio ?? '',
          uf_destinatario:         nota.uf ?? '',
          cep_destinatario:        soDigitos((nota as any).cep),
        })
      }
    }

    const payload = {
      natureza_operacao:  natureza,
      data_emissao:       new Date().toISOString(),
      tipo_documento:     '1',
      finalidade_emissao: '1',
      consumidor_final:   ehParaContribuinte ? '0' : '1',
      // Número, só dígitos — a Focus recusa como string formatada.
      cnpj_emitente:       Number(soDigitos(cfg.cnpj)),
      // 1 presencial (balcão) · 4 entrega em domicílio
      presenca_comprador: ehNfce ? '1' : '4',
      // 1 interna · 2 interestadual. A SEFAZ usa para validar o CFOP do item.
      local_destino:      mesmoEstado ? '1' : '2',
      // 9 = sem frete, igual à NF-e 3.313 do Everest.
      modalidade_frete:   '9',
      ...(cfg.mensagem_fiscal ? { informacoes_adicionais_contribuinte: String(cfg.mensagem_fiscal) } : {}),
      ...destinatario,
      // `items`, não `itens`. É o nome do campo na API da Focus; com o nome
      // errado a nota ia sem item nenhum.
      items: nota.itens.map((item, i) => {
        const aliqPis    = Number((item as any).aliqPis ?? 0)
        const aliqCofins = Number((item as any).aliqCofins ?? 0)
        return {
          numero_item:               String(i + 1),
          // Referência interna do vendedor — não é código validado pela
          // SEFAZ. Item avulso (sem produtoId, digitado à mão) não manda o
          // campo; a Focus aceita a omissão.
          ...((item as any).produtoId ? { codigo_produto: String((item as any).produtoId) } : {}),
          descricao:                 item.descricao,
          codigo_ncm:                item.ncm,
          ...((item as any).cest ? { cest: soDigitos((item as any).cest) } : {}),
          cfop:                      item.cfop,
          unidade_comercial:         item.unidade || 'UN',
          quantidade_comercial:      String(parseFloat(String(item.quantidade))),
          valor_unitario_comercial:  (item.precoUnitario / 100).toFixed(2),
          valor_unitario_tributavel: (item.precoUnitario / 100).toFixed(2),
          quantidade_tributavel:     String(parseFloat(String(item.quantidade))),
          valor_bruto:               (item.valorTotal / 100).toFixed(2),
          inclui_no_total:           '1',
          icms_situacao_tributaria:  item.cstCsosn,
          icms_origem:               (item as any).origem ?? '0',
          ...(Number(item.aliqIcms) > 0 ? { icms_aliquota: String(item.aliqIcms) } : {}),
          ...grupoSt(item),
          pis_situacao_tributaria:    (item as any).cstPis    ?? '07',
          ...(aliqPis    > 0 ? { pis_aliquota_porcentual:    String(aliqPis) }    : {}),
          cofins_situacao_tributaria: (item as any).cstCofins ?? '07',
          ...(aliqCofins > 0 ? { cofins_aliquota_porcentual: String(aliqCofins) } : {}),
        }
      }),
      formas_pagamento: await this.formasDePagamento(nota),
    }

    // ROTA: /v2/nfe e /v2/nfce.
    //
    // Antes era `nota.tipo.toLowerCase()`, com o tipo gravado como 'NF-e' e
    // 'NFC-e' — montava /v2/nf-e e /v2/nfc-e, endereços que não existem.
    // Nenhuma emissão teria funcionado, nem a do balcão.
    const rota = ehNfce ? 'nfce' : 'nfe'

    const response = await fetch(`${baseUrl}/v2/${rota}?ref=${encodeURIComponent(ref)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + Buffer.from(`${config.token}:`).toString('base64'),
      },
      body: JSON.stringify(payload),
    })

    const result = await response.json().catch(() => ({} as any))
    const now = new Date()

    await this.db.update(dbNotaFiscal).set({
      status:      result.status === 'autorizado' ? 'autorizada' : 'pendente',
      chaveAcesso: result.chave_nfe ?? result.chave_nfce ?? null,
      numero:      result.numero ?? null,
      serie:       result.serie ?? null,
      xmlUrl:      result.caminho_xml_nota_fiscal ?? null,
      danfeUrl:    result.caminho_danfe ?? null,
      updatedDt:   now, updatedBy: 1,
    }).where(eq(dbNotaFiscal.notaId, notaId))

    // Recusa da SEFAZ não pode voltar como sucesso silencioso: a tela mostraria
    // "emitida" para uma nota que não existe.
    //
    // A Focus responde HTTP 200 mesmo quando a SEFAZ REJEITA a nota — o
    // resultado real vem em `result.status`, não no código HTTP. Checar só
    // `response.ok` deixava passar rejeição como se fosse sucesso: a nota
    // ficava "pendente" para sempre, sem erro nenhum na tela, e o operador
    // achava que só não tinha acontecido nada.
    const autorizado      = result.status === 'autorizado'
    const emProcessamento = result.status === 'processando_autorizacao' || response.status === 202
    if (!response.ok || (!autorizado && !emProcessamento)) {
      throw new Error(
        result?.mensagem_sefaz ?? result?.mensagem ?? result?.erros?.[0]?.mensagem ??
        'A emissao foi recusada. Verifique no modulo Fiscal.'
      )
    }

    return result
  }

  /**
   * Cancelamento, com o prazo verificado ANTES de chamar a SEFAZ.
   *
   * NFC-e: 30 minutos. NF-e: 24 horas. Passou disso, a SEFAZ recusa — e a
   * recusa vem como codigo numerico, que no balcao nao ajuda ninguem.
   *
   * Alguns estados adotam prazos menores. O que esta aqui e a regra geral;
   * quando a SEFAZ recusar dentro do prazo, e porque o estado e mais curto.
   */
  async cancelarNota(notaId: number, motivo: string, config: { token: string; ambiente: string }) {
    const [nota] = await this.db.select().from(dbNotaFiscal).where(eq(dbNotaFiscal.notaId, notaId))
    if (!nota) throw new Error('Nota não encontrada')

    if (nota.status === 'cancelada') throw new Error('Esta nota ja esta cancelada.')

    // So nota autorizada tem prazo a respeitar. Rascunho pendente nao foi
    // transmitido e pode ser descartado a qualquer momento.
    if (nota.status === 'autorizada' && nota.dataEmissao) {
      const ehNfce   = String(nota.tipo).toUpperCase() === 'NFC-E'
      const limiteMs = ehNfce ? 30 * 60 * 1000 : 24 * 60 * 60 * 1000
      const passado  = Date.now() - new Date(nota.dataEmissao).getTime()
      if (passado > limiteMs) {
        const limite = ehNfce ? '30 minutos' : '24 horas'
        throw new Error(
          `Prazo de cancelamento vencido: ${limite} apos a autorizacao. ` +
          'A correcao passa a ser por nota de devolucao — fale com o contador.'
        )
      }
    }

    if (config.token && nota.chaveAcesso) {
      const baseUrl = config.ambiente === 'producao'
        ? 'https://api.focusnfe.com.br'
        : 'https://homologacao.focusnfe.com.br'

      // Mesma correção da emissão: 'NFC-e'.toLowerCase() virava 'nfc-e'.
      const rotaCancel = String(nota.tipo).toUpperCase() === 'NFC-E' ? 'nfce' : 'nfe'
      await fetch(`${baseUrl}/v2/${rotaCancel}/${nota.chaveAcesso}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Basic ' + Buffer.from(`${config.token}:`).toString('base64'),
        },
        body: JSON.stringify({ justificativa: motivo }),
      })
    }

    await this.db.update(dbNotaFiscal).set({
      status: 'cancelada', motivoCancelamento: motivo, updatedDt: new Date(), updatedBy: 1,
    }).where(eq(dbNotaFiscal.notaId, notaId))

    return { ok: true }
  }

  // ── Relatórios ────────────────────────────────────────────────────────────
  // Importante: somam o que já está LANÇADO nos itens das notas. Não
  // calculam imposto por regra fiscal — não existe motor de tributação
  // automático aqui, só agregação do que foi preenchido manualmente ou
  // veio do payload de emissão.

  async relatorioResumoMensal(ano: number) {
    const result = await this.db.execute(sql`
      SELECT TO_CHAR(DATE_TRUNC('month', data_emissao), 'Mon/YY') as mes,
             tipo,
             COUNT(*) FILTER (WHERE status = 'autorizada')::int as autorizadas,
             COUNT(*) FILTER (WHERE status = 'cancelada')::int  as canceladas,
             COUNT(*) FILTER (WHERE status = 'pendente')::int   as pendentes,
             COALESCE(SUM(valor_total) FILTER (WHERE status = 'autorizada'), 0)::bigint as valor_total
      FROM t_nota_fiscal
      WHERE active_flg = true AND EXTRACT(YEAR FROM data_emissao) = ${ano}
      GROUP BY DATE_TRUNC('month', data_emissao), tipo
      ORDER BY DATE_TRUNC('month', data_emissao)
    `)
    return (result.rows as any[]).map(r => ({
      mes: r.mes, tipo: r.tipo,
      autorizadas: Number(r.autorizadas), canceladas: Number(r.canceladas), pendentes: Number(r.pendentes),
      valorTotal: Number(r.valor_total),
    }))
  }

  async relatorioPorFormaPagamento({ dataInicio, dataFim }: { dataInicio?: string; dataFim?: string }) {
    const result = await this.db.execute(sql`
      SELECT vp.forma, COUNT(DISTINCT n.nota_id)::int as qtd_notas, COALESCE(SUM(vp.valor), 0)::bigint as total
      FROM t_nota_fiscal n
      JOIN t_venda_pagamento vp ON vp.venda_id = n.venda_id
      WHERE n.active_flg = true AND n.status = 'autorizada'
        ${dataInicio ? sql`AND n.data_emissao >= ${dataInicio}` : sql``}
        ${dataFim    ? sql`AND n.data_emissao <= ${dataFim}`    : sql``}
      GROUP BY vp.forma ORDER BY total DESC
    `)
    return (result.rows as any[]).map(r => ({ forma: r.forma, qtdNotas: Number(r.qtd_notas), total: Number(r.total) }))
  }

  async relatorioApuracaoImpostos({ dataInicio, dataFim }: { dataInicio?: string; dataFim?: string }) {
    const result = await this.db.execute(sql`
      SELECT TO_CHAR(DATE_TRUNC('month', n.data_emissao), 'Mon/YY') as mes,
             COALESCE(SUM(i.valor_icms), 0)::bigint as icms,
             COALESCE(SUM(i.valor_ipi),  0)::bigint as ipi,
             COALESCE(SUM(i.base_st),    0)::bigint as base_st,
             COALESCE(SUM(i.valor_st),   0)::bigint as valor_st
      FROM t_nota_fiscal_item i
      JOIN t_nota_fiscal n ON n.nota_id = i.nota_id
      WHERE n.active_flg = true AND n.status = 'autorizada'
        ${dataInicio ? sql`AND n.data_emissao >= ${dataInicio}` : sql``}
        ${dataFim    ? sql`AND n.data_emissao <= ${dataFim}`    : sql``}
      GROUP BY DATE_TRUNC('month', n.data_emissao) ORDER BY DATE_TRUNC('month', n.data_emissao)
    `)
    return (result.rows as any[]).map(r => ({
      mes: r.mes, icms: Number(r.icms), ipi: Number(r.ipi), baseSt: Number(r.base_st), valorSt: Number(r.valor_st),
    }))
  }
}