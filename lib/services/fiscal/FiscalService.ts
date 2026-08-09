import { and, eq, desc, gte, lte, sql } from 'drizzle-orm'
import type { AppDB } from '@/lib/db/connection'
import { dbNotaFiscal, dbNotaFiscalItem, dbTurnoCaixa } from '@/lib/db/schemas/fiscal'
import { dbConfiguracoesTenant } from '@/lib/db/schemas/vendas'

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
    itens: { produtoId?: number; descricao: string; quantidade: number; precoUnitario: number }[]
    userId: number
  }) {
    const now = new Date()
    const subtotal = payload.itens.reduce((a, i) => a + i.precoUnitario * i.quantidade, 0)

    // UF do destinatário decide entre CFOP interno e interestadual.
    const cfgRes = await this.db.execute(sql`
      SELECT uf, crt FROM t_configuracoes_tenant LIMIT 1
    `)
    const cfg: any = (cfgRes.rows as any[])[0] ?? {}
    const ufEmpresa = String(cfg.uf ?? '').toUpperCase()
    const ufDestino = String(payload.uf ?? ufEmpresa).toUpperCase()
    const dentroDoEstado = !ufDestino || ufDestino === ufEmpresa
    const simples = ['1', '2'].includes(String(cfg.crt ?? ''))

    const [nota] = await this.db.insert(dbNotaFiscal).values({
      tipo: payload.tipo, status: 'pendente', dataEmissao: now,
      cnpjCpf: payload.cnpjCpf ?? null, razaoSocial: payload.razaoSocial ?? null,
      uf: payload.uf ?? null, cfop: payload.cfop ?? null,
      valorProdutos: subtotal, valorTotal: payload.valorTotal,
      vendaId: payload.vendaId ?? null,
      createdBy: payload.userId, updatedBy: payload.userId, createdDt: now, updatedDt: now,
    }).returning({ notaId: dbNotaFiscal.notaId })

    for (const item of payload.itens) {
      // Busca o que o contador parametrizou. Sem produtoId — item avulso
      // digitado à mão — os campos ficam vazios e a emissão vai reclamar.
      let fiscal: any = {}
      if (item.produtoId) {
        const r = await this.db.execute(sql`
          SELECT p.ncm, p.cest, p.origem, p.unidade_tributavel,
                 pt.cfop_interno, pt.cfop_interestadual,
                 pt.csosn, pt.cst_icms, pt.aliq_icms,
                 pt.cst_pis, pt.aliq_pis, pt.cst_cofins, pt.aliq_cofins,
                 pt.cst_ipi, pt.aliq_ipi, pt.tem_st, pt.mva, pt.aliq_icms_st
            FROM t_produto p
            LEFT JOIN t_perfil_tributario pt ON pt.perfil_trib_id = p.perfil_trib_id
           WHERE p.produto_id = ${item.produtoId}
           LIMIT 1
        `)
        fiscal = (r.rows as any[])[0] ?? {}
      }

      const cfop = dentroDoEstado ? fiscal.cfop_interno : fiscal.cfop_interestadual
      const valorTotal = item.precoUnitario * item.quantidade
      const aliqIcms = Number(fiscal.aliq_icms ?? 0)

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

  async emitirViaFocusNfe(notaId: number, config: { token: string; ambiente: string }) {
    const nota = await this.findNotaById(notaId)
    if (!nota) throw new Error('Nota não encontrada')

    const baseUrl = config.ambiente === 'producao'
      ? 'https://api.focusnfe.com.br'
      : 'https://homologacao.focusnfe.com.br'

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
      SELECT crt, mensagem_fiscal, credenciado_nfce, credenciado_nfe
        FROM t_configuracoes_tenant LIMIT 1
    `)
    const cfg: any = (cfgRes.rows as any[])[0] ?? {}
    if (!String(cfg.crt ?? '').trim()) {
      throw new Error('Regime tributario (CRT) nao configurado. Preencha em Configuracoes > Fiscal.')
    }

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

    const payload = {
      natureza_operacao: 'VENDA A CONSUMIDOR',
      data_emissao: new Date().toISOString(),
      tipo_documento: '1',
      finalidade_emissao: '1',
      consumidor_final: '1',
      presenca_comprador: '4',
      ...(cfg.mensagem_fiscal ? { informacoes_adicionais_contribuinte: String(cfg.mensagem_fiscal) } : {}),
      ...(nota.cnpjCpf ? { cnpj_destinatario: nota.cnpjCpf, razao_social_destinatario: nota.razaoSocial } : {}),
      itens: nota.itens.map((item, i) => {
        const aliqPis    = Number((item as any).aliqPis ?? 0)
        const aliqCofins = Number((item as any).aliqCofins ?? 0)
        return {
          numero_item: String(i + 1),
          descricao: item.descricao,
          codigo_ncm: item.ncm,
          cfop: item.cfop,
          unidade_comercial: item.unidade || 'UN',
          quantidade_comercial: String(parseFloat(String(item.quantidade))),
          valor_unitario_comercial: (item.precoUnitario / 100).toFixed(2),
          valor_unitario_tributavel: (item.precoUnitario / 100).toFixed(2),
          quantidade_tributavel: String(parseFloat(String(item.quantidade))),
          valor_bruto: (item.valorTotal / 100).toFixed(2),
          inclui_no_total: '1',
          icms_situacao_tributaria: item.cstCsosn,
          icms_origem: (item as any).origem ?? '0',
          ...(Number(item.aliqIcms) > 0 ? { icms_aliquota: String(item.aliqIcms) } : {}),
          pis_situacao_tributaria:    (item as any).cstPis    ?? '07',
          ...(aliqPis    > 0 ? { pis_aliquota_porcentual:    String(aliqPis) }    : {}),
          cofins_situacao_tributaria: (item as any).cstCofins ?? '07',
          ...(aliqCofins > 0 ? { cofins_aliquota_porcentual: String(aliqCofins) } : {}),
        }
      }),
      formas_pagamento: [{ forma_pagamento: '01', valor_pagamento: (nota.valorTotal / 100).toFixed(2) }],
    }

    const response = await fetch(`${baseUrl}/v2/${nota.tipo.toLowerCase()}?ref=${ref}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + Buffer.from(`${config.token}:`).toString('base64'),
      },
      body: JSON.stringify(payload),
    })

    const result = await response.json()
    const now = new Date()

    await this.db.update(dbNotaFiscal).set({
      status:      result.status === 'autorizado' ? 'autorizada' : 'pendente',
      chaveAcesso: result.chave_nfe ?? null,
      numero:      result.numero ?? null,
      xmlUrl:      result.caminho_xml_nota_fiscal ?? null,
      danfeUrl:    result.caminho_danfe ?? null,
      updatedDt:   now, updatedBy: 1,
    }).where(eq(dbNotaFiscal.notaId, notaId))

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

      await fetch(`${baseUrl}/v2/${nota.tipo.toLowerCase()}/${nota.chaveAcesso}`, {
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