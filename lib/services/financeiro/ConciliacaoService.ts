import { and, eq, desc, count, sql } from 'drizzle-orm'
import type { AppDB } from '@/lib/db/connection'
import { dbContaBancaria, dbExtratoBancario } from '@/lib/db/schemas/financeiro-completo'
import { dbContaPagar } from '@/lib/db/schemas/financeiro-completo'
import { dbContaReceber } from '@/lib/db/schemas/financeiro-completo'

// ── Parser OFX ────────────────────────────────────────────────────────────────
// Suporta OFX 1.x SGML (padrão dos bancos brasileiros) e OFX 2.x XML

interface OFXTransacao {
  tipo:      'credito' | 'debito'
  data:      string   // YYYY-MM-DD
  valor:     number   // centavos, positivo = crédito, negativo = débito
  descricao: string
  referencia: string  // FITID
}

function parseOFX(conteudo: string): OFXTransacao[] {
  const transacoes: OFXTransacao[] = []

  // Normaliza quebras de linha e remove cabeçalho SGML antes do <OFX>
  const body = conteudo.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  // Divide nos blocos STMTTRN
  const blocos = body.split(/<STMTTRN>/i).slice(1)

  for (const bloco of blocos) {
    const get = (tag: string) => {
      // Suporta: <TAG>VALOR e <TAG>VALOR</TAG>
      const m = bloco.match(new RegExp(`<${tag}>([^<\\n\\r]+)`, 'i'))
      return m ? m[1].trim() : ''
    }

    const trntype  = get('TRNTYPE').toUpperCase()
    const dtposted = get('DTPOSTED')
    const trnamt   = get('TRNAMT')
    const fitid    = get('FITID')
    const memo     = get('MEMO') || get('NAME') || get('CHECKNUM') || ''

    if (!dtposted || !trnamt) continue

    // Parse data: YYYYMMDDHHMMSS[tz] → YYYY-MM-DD
    const dataStr = dtposted.replace(/^(\d{4})(\d{2})(\d{2}).*/, '$1-$2-$3')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataStr)) continue

    // Parse valor
    const amtFloat = parseFloat(trnamt.replace(',', '.'))
    if (isNaN(amtFloat)) continue
    const valorCentavos = Math.round(amtFloat * 100)

    transacoes.push({
      tipo:      valorCentavos >= 0 ? 'credito' : 'debito',
      data:      dataStr,
      valor:     valorCentavos,
      descricao: memo.slice(0, 290),
      referencia: fitid || `${dataStr}-${Math.abs(valorCentavos)}`,
    })
  }

  return transacoes
}

// ── Service ───────────────────────────────────────────────────────────────────
export class ConciliacaoService {
  constructor(private db: AppDB) {}

  // ── Contas Bancárias ────────────────────────────────────────────────────────
  async listContas() {
    return this.db.select().from(dbContaBancaria)
      .where(eq(dbContaBancaria.activeFlag, true))
      .orderBy(dbContaBancaria.nome)
  }

  async criarConta(payload: { nome: string; banco?: string; agencia?: string; conta?: string; tipo?: string; saldoInicial?: number }, userId: number) {
    const now = new Date()
    const [result] = await this.db.insert(dbContaBancaria).values({
      nome:         payload.nome,
      banco:        payload.banco,
      agencia:      payload.agencia,
      conta:        payload.conta,
      tipo:         payload.tipo ?? 'corrente',
      saldoInicial: payload.saldoInicial ?? 0,
      createdBy: userId, updatedBy: userId, createdDt: now, updatedDt: now,
    }).returning({ contaBancariaId: dbContaBancaria.contaBancariaId })
    return result
  }

  async excluirConta(id: number, userId: number) {
    await this.db.update(dbContaBancaria).set({ activeFlag: false, updatedDt: new Date(), updatedBy: userId })
      .where(eq(dbContaBancaria.contaBancariaId, id))
    return { ok: true }
  }

  // ── Extrato / OFX ──────────────────────────────────────────────────────────
  async importarOFX(contaBancariaId: number, conteudoOFX: string, userId: number) {
    const transacoes = parseOFX(conteudoOFX)
    if (transacoes.length === 0) throw new Error('Nenhuma transação encontrada no arquivo OFX.')

    const now    = new Date()
    const lote   = `OFX-${now.getTime()}`
    let importados = 0
    let duplicados = 0

    for (const t of transacoes) {
      // Verifica duplicata pela referencia (FITID)
      if (t.referencia) {
        const existing = await this.db.select({ id: dbExtratoBancario.extratoId })
          .from(dbExtratoBancario)
          .where(and(
            eq(dbExtratoBancario.contaBancariaId, contaBancariaId),
            eq(dbExtratoBancario.referencia, t.referencia)
          ))
        if (existing.length > 0) { duplicados++; continue }
      }

      await this.db.insert(dbExtratoBancario).values({
        contaBancariaId,
        dataMovimento: t.data,
        descricao:     t.descricao,
        valor:         t.valor,
        tipo:          t.tipo,
        referencia:    t.referencia,
        importacaoLote: lote,
        createdBy: userId, updatedBy: userId, createdDt: now, updatedDt: now,
      })
      importados++
    }

    return { importados, duplicados, total: transacoes.length, lote }
  }

  async listExtrato(contaBancariaId: number, { status, page = 1, limit = 50 }: {
    status?: string; page?: number; limit?: number
  }) {
    const offset = (page - 1) * limit
    const conds = [eq(dbExtratoBancario.contaBancariaId, contaBancariaId), eq(dbExtratoBancario.activeFlag, true)]
    if (status && status !== 'todas') conds.push(eq(dbExtratoBancario.status, status as any))
    const where = and(...conds)

    const [rows, totals] = await Promise.all([
      this.db.select().from(dbExtratoBancario).where(where)
        .orderBy(desc(dbExtratoBancario.dataMovimento)).limit(limit).offset(offset),
      this.db.select({ total: count() }).from(dbExtratoBancario).where(where),
    ])
    return { data: rows, meta: { total: Number(totals[0]?.total ?? 0), page, limit } }
  }

  async kpisExtrato(contaBancariaId: number) {
    const [stats] = await this.db.select({
      pendentes:   sql<number>`COUNT(*) FILTER (WHERE status = 'pendente')`,
      conciliados: sql<number>`COUNT(*) FILTER (WHERE status = 'conciliado')`,
      creditos:    sql<number>`COALESCE(SUM(valor) FILTER (WHERE tipo = 'credito'), 0)`,
      debitos:     sql<number>`COALESCE(SUM(ABS(valor)) FILTER (WHERE tipo = 'debito'), 0)`,
    }).from(dbExtratoBancario)
      .where(and(eq(dbExtratoBancario.contaBancariaId, contaBancariaId), eq(dbExtratoBancario.activeFlag, true)))
    return {
      pendentes:   Number(stats?.pendentes   ?? 0),
      conciliados: Number(stats?.conciliados ?? 0),
      creditos:    Number(stats?.creditos    ?? 0),
      debitos:     Number(stats?.debitos     ?? 0),
    }
  }

  // ── Conciliar lançamento ────────────────────────────────────────────────────
  async conciliar(extratoId: number, { tipo, referenciaId }: {
    tipo: 'conta_pagar' | 'conta_receber' | 'outro'; referenciaId?: number
  }, userId: number) {
    await this.db.update(dbExtratoBancario).set({
      status:             'conciliado',
      conciliadoComTipo:  tipo,
      conciliadoComId:    referenciaId,
      updatedDt: new Date(), updatedBy: userId,
    }).where(eq(dbExtratoBancario.extratoId, extratoId))
    return { ok: true }
  }

  async ignorar(extratoId: number, userId: number) {
    await this.db.update(dbExtratoBancario).set({
      status: 'ignorado', updatedDt: new Date(), updatedBy: userId,
    }).where(eq(dbExtratoBancario.extratoId, extratoId))
    return { ok: true }
  }
}