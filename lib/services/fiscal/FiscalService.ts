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

  async criarNota(payload: {
    tipo: string; cnpjCpf?: string; razaoSocial?: string; uf?: string
    cfop?: string; valorTotal: number; vendaId?: number
    itens: { descricao: string; quantidade: number; precoUnitario: number; ncm?: string; cfop?: string; cstCsosn?: string; aliqIcms?: number }[]
    userId: number
  }) {
    const now = new Date()
    const subtotal = payload.itens.reduce((a, i) => a + i.precoUnitario * i.quantidade, 0)
    const [nota] = await this.db.insert(dbNotaFiscal).values({
      tipo: payload.tipo, status: 'pendente', dataEmissao: now,
      cnpjCpf: payload.cnpjCpf ?? null, razaoSocial: payload.razaoSocial ?? null,
      uf: payload.uf ?? null, cfop: payload.cfop ?? null,
      valorProdutos: subtotal, valorTotal: payload.valorTotal,
      vendaId: payload.vendaId ?? null,
      createdBy: payload.userId, updatedBy: payload.userId, createdDt: now, updatedDt: now,
    }).returning({ notaId: dbNotaFiscal.notaId })

    for (const item of payload.itens) {
      await this.db.insert(dbNotaFiscalItem).values({
        notaId: nota.notaId, descricao: item.descricao,
        quantidade: String(item.quantidade),
        precoUnitario: item.precoUnitario,
        valorTotal: item.precoUnitario * item.quantidade,
        ncm: item.ncm ?? null, cfop: item.cfop ?? null,
        cstCsosn: item.cstCsosn ?? '102',
        aliqIcms: String(item.aliqIcms ?? 0),
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

    const payload = {
      natureza_operacao: 'VENDA A CONSUMIDOR',
      data_emissao: new Date().toISOString(),
      tipo_documento: '1',
      finalidade_emissao: '1',
      consumidor_final: '1',
      presenca_comprador: '4',
      ...(nota.cnpjCpf ? { cnpj_destinatario: nota.cnpjCpf, razao_social_destinatario: nota.razaoSocial } : {}),
      itens: nota.itens.map((item, i) => ({
        numero_item: String(i + 1),
        descricao: item.descricao,
        codigo_ncm: item.ncm || '00000000',
        cfop: item.cfop || '5102',
        unidade_comercial: 'UN',
        quantidade_comercial: String(parseFloat(String(item.quantidade))),
        valor_unitario_comercial: (item.precoUnitario / 100).toFixed(2),
        valor_unitario_tributavel: (item.precoUnitario / 100).toFixed(2),
        quantidade_tributavel: String(parseFloat(String(item.quantidade))),
        valor_bruto: (item.valorTotal / 100).toFixed(2),
        inclui_no_total: '1',
        icms_situacao_tributaria: item.cstCsosn || '102',
        icms_origem: '0',
        pis_situacao_tributaria: '07',
        cofins_situacao_tributaria: '07',
      })),
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

  async cancelarNota(notaId: number, motivo: string, config: { token: string; ambiente: string }) {
    const [nota] = await this.db.select().from(dbNotaFiscal).where(eq(dbNotaFiscal.notaId, notaId))
    if (!nota) throw new Error('Nota não encontrada')

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