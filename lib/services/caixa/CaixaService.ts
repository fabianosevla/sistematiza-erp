// ESTE ARQUIVO VAI EM: lib/services/caixa/CaixaService.ts
//
// CONTROLE DE CAIXA — abrir, movimentar, conferir e fechar.
//
// Mora aqui, e não no módulo fiscal, porque caixa é controle de DINHEIRO.
// Uma empresa que nunca emitiu nota ainda precisa saber se a gaveta bate no
// fim do dia; uma que emite pode não querer controle nenhum. O turno estava no
// fiscal por acidente de história — a tabela nasceu lá.
//
// ─── DOIS REGIMES ───────────────────────────────────────────────────────────
//
//   'dia'      um turno por vez. A loja inteira vende nele, e a diferença é da
//              loja. É o caso de quem tem um balcão só.
//
//   'operador' um turno por caixa, simultâneos. Cada operador responde pelo
//              seu. É o caso de quem tem cinco PCs vendendo ao mesmo tempo.
//
// O `abrirTurno` antigo recusava abrir se QUALQUER turno estivesse aberto —
// o que impedia o segundo caixa de operar. Agora a recusa depende do regime.
//
// ─── POR QUE A VENDA GRAVA O CAIXA ──────────────────────────────────────────
//
// O relatório antigo filtrava as vendas por janela de horário — da abertura ao
// fechamento. Com vários turnos abertos ao mesmo tempo, essa janela se
// sobrepõe: cada caixa mostraria o faturamento da loja inteira. Cinco
// relatórios idênticos, todos errados.
//
// Com `turno_id` na venda, a atribuição vem do dado e não do relógio.
import { and, eq, desc, sql } from 'drizzle-orm'
import type { AppDB } from '@/lib/db/connection'
import { dbTurnoCaixa, dbMovimentoCaixa } from '@/lib/db/schemas/fiscal'

export type Regime = 'dia' | 'operador'

export class CaixaService {
  constructor(private db: AppDB) {}

  private async regime(): Promise<Regime> {
    const r = await this.db.execute(sql`
      SELECT COALESCE(regime_turno, 'dia') AS regime FROM t_configuracoes_tenant LIMIT 1
    `)
    return ((r.rows[0] as any)?.regime === 'operador' ? 'operador' : 'dia')
  }

  /**
   * O turno em que uma venda deve entrar.
   *
   * No regime por dia existe um só, e o número do caixa é irrelevante para
   * escolher. No regime por operador, cada caixa tem o seu — e vender sem
   * turno aberto naquele caixa não deve acontecer.
   */
  async turnoDaVenda(numeroCaixa?: number) {
    const reg = await this.regime()
    const conds = [eq(dbTurnoCaixa.status, 'aberto'), eq(dbTurnoCaixa.activeFlag, true)]
    if (reg === 'operador' && numeroCaixa) {
      conds.push(eq(dbTurnoCaixa.numeroCaixa, numeroCaixa))
    }
    const [t] = await this.db.select().from(dbTurnoCaixa)
      .where(and(...conds)).orderBy(desc(dbTurnoCaixa.abertoEm)).limit(1)
    return t ?? null
  }

  async abertos() {
    return this.db.select().from(dbTurnoCaixa)
      .where(and(eq(dbTurnoCaixa.status, 'aberto'), eq(dbTurnoCaixa.activeFlag, true)))
      .orderBy(dbTurnoCaixa.numeroCaixa)
  }

  async abrir({ operador, numeroCaixa, valorAbertura, userId }: {
    operador: string; numeroCaixa: number; valorAbertura: number; userId: number
  }) {
    const reg = await this.regime()
    const abertos = await this.abertos()

    if (reg === 'dia' && abertos.length > 0) {
      throw new Error('Já existe um caixa aberto. No regime por dia, só um turno por vez.')
    }
    if (reg === 'operador' && abertos.some(t => t.numeroCaixa === numeroCaixa)) {
      throw new Error(`O caixa ${numeroCaixa} já está aberto.`)
    }

    const now = new Date()
    const [r] = await this.db.insert(dbTurnoCaixa).values({
      operador, numeroCaixa, valorAbertura, abertoEm: now, status: 'aberto',
      createdBy: userId, updatedBy: userId, createdDt: now, updatedDt: now,
    }).returning({ turnoId: dbTurnoCaixa.turnoId })
    return r
  }

  /** Sangria tira da gaveta; suprimento coloca. */
  async movimentar({ turnoId, tipo, valor, motivo, userId }: {
    turnoId: number; tipo: 'sangria' | 'suprimento'; valor: number; motivo?: string; userId: number
  }) {
    if (!['sangria', 'suprimento'].includes(tipo)) throw new Error('Tipo inválido.')
    if (!valor || valor <= 0) throw new Error('Informe um valor maior que zero.')

    const [turno] = await this.db.select().from(dbTurnoCaixa)
      .where(eq(dbTurnoCaixa.turnoId, turnoId))
    if (!turno) throw new Error('Turno não encontrado.')
    if (turno.status !== 'aberto') throw new Error('Este turno já foi fechado.')

    const now = new Date()
    const [r] = await this.db.insert(dbMovimentoCaixa).values({
      turnoId, tipo, valor, motivo: motivo ?? null, ocorridoEm: now,
      createdBy: userId, updatedBy: userId, createdDt: now, updatedDt: now,
    }).returning({ movimentoId: dbMovimentoCaixa.movimentoId })
    return r
  }

  /**
   * Tudo que passou por um turno.
   *
   * A conferência olha SÓ DINHEIRO. Cartão e PIX não passam pela gaveta, e
   * somá-los criaria uma diferença que não existe. Mas eles aparecem no
   * resumo, porque o gestor quer saber quanto o caixa faturou — não só quanto
   * tem em espécie.
   */
  async resumo(turnoId: number) {
    const [turno] = await this.db.select().from(dbTurnoCaixa)
      .where(eq(dbTurnoCaixa.turnoId, turnoId))
    if (!turno) return null

    // Vendas atribuídas a este turno. Sem `turno_id` gravado — vendas
    // anteriores a esta mudança — cai para a janela de horário, que é o
    // comportamento antigo e vale enquanto houver um turno por vez.
    const pag = await this.db.execute(sql`
      SELECT vp.forma,
             COUNT(DISTINCT v.venda_id)::int AS vendas,
             COALESCE(SUM(vp.valor), 0)::int AS total
        FROM t_venda v
        JOIN t_venda_pagamento vp ON vp.venda_id = v.venda_id AND vp.active_flg = true
       WHERE v.active_flg = true
         AND (
           v.turno_id = ${turnoId}
           OR (v.turno_id IS NULL
               AND v.vendida_em >= ${turno.abertoEm}
               AND (${turno.fechadoEm}::timestamptz IS NULL OR v.vendida_em <= ${turno.fechadoEm}))
         )
       GROUP BY vp.forma ORDER BY vp.forma
    `)

    // Quebra por caixa: responde "em qual máquina faltou".
    const porCaixa = await this.db.execute(sql`
      SELECT COALESCE(v.numero_caixa, 0) AS caixa,
             COUNT(DISTINCT v.venda_id)::int AS vendas,
             COALESCE(SUM(v.total), 0)::int  AS total
        FROM t_venda v
       WHERE v.active_flg = true AND v.turno_id = ${turnoId}
       GROUP BY v.numero_caixa ORDER BY 1
    `)

    const mov = await this.db.execute(sql`
      SELECT tipo, COALESCE(SUM(valor), 0)::int AS total
        FROM t_movimento_caixa
       WHERE turno_id = ${turnoId} AND active_flg = true
       GROUP BY tipo
    `)

    const formas = (pag.rows as any[]).map(x => ({
      forma: x.forma, vendas: Number(x.vendas), total: Number(x.total),
    }))
    // Comparação frouxa: cada cliente cadastra o nome da forma como quiser.
    const emDinheiro = formas
      .filter(f => /dinheiro|especie|espécie/i.test(f.forma))
      .reduce((a, f) => a + f.total, 0)

    const linhas     = mov.rows as any[]
    const sangrias   = Number(linhas.find(m => m.tipo === 'sangria')?.total ?? 0)
    const suprimentos= Number(linhas.find(m => m.tipo === 'suprimento')?.total ?? 0)

    return {
      turno,
      formas,
      porCaixa: (porCaixa.rows as any[]).map(x => ({
        caixa: Number(x.caixa), vendas: Number(x.vendas), total: Number(x.total),
      })),
      totalVendido:   formas.reduce((a, f) => a + f.total, 0),
      emDinheiro,
      sangrias,
      suprimentos,
      // A conta que o operador confere:
      //   abertura + dinheiro vendido + suprimentos − sangrias
      esperadoGaveta: turno.valorAbertura + emDinheiro + suprimentos - sangrias,
    }
  }

  /**
   * Fecha conferindo.
   *
   * `valorEsperado` e `diferenca` ficam CONGELADOS na linha do turno. Não são
   * recalculados na leitura de propósito: uma venda cancelada semana que vem
   * mudaria o "esperado" de um turno já conferido e assinado, e o operador
   * apareceria com uma falta que não existia no dia.
   */
  async fechar({ turnoId, valorFechamento, observacao, userId }: {
    turnoId: number; valorFechamento: number; observacao?: string; userId: number
  }) {
    const resumo = await this.resumo(turnoId)
    if (!resumo) throw new Error('Turno não encontrado.')
    if (resumo.turno.status !== 'aberto') throw new Error('Este turno já foi fechado.')

    const esperado  = resumo.esperadoGaveta
    const diferenca = valorFechamento - esperado
    const now = new Date()

    await this.db.update(dbTurnoCaixa).set({
      status: 'fechado', valorFechamento, valorEsperado: esperado, diferenca,
      fechadoEm: now, observacao: observacao ?? null,
      updatedDt: now, updatedBy: userId,
    }).where(eq(dbTurnoCaixa.turnoId, turnoId))

    return { ok: true, esperado, conferido: valorFechamento, diferenca }
  }

  /** Histórico para o gestor: quem fechou, quando, e com qual diferença. */
  async historico({ dataInicio, dataFim }: { dataInicio?: string; dataFim?: string } = {}) {
    const r = await this.db.execute(sql`
      SELECT t.*,
             COALESCE((SELECT SUM(v.total) FROM t_venda v
                        WHERE v.turno_id = t.turno_id AND v.active_flg = true), 0)::int AS vendido
        FROM t_turno_caixa t
       WHERE t.active_flg = true
         AND (${dataInicio ?? null}::date IS NULL OR t.aberto_em::date >= ${dataInicio ?? null}::date)
         AND (${dataFim    ?? null}::date IS NULL OR t.aberto_em::date <= ${dataFim    ?? null}::date)
       ORDER BY t.aberto_em DESC
       LIMIT 200
    `)
    return r.rows
  }
}
