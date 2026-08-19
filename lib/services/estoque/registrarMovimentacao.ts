// ESTE ARQUIVO VAI EM: lib/services/estoque/registrarMovimentacao.ts
//
// TODO MOVIMENTO DE ESTOQUE DEIXA RASTRO.
//
// `t_movimentacao_estoque` é a auditoria: quem mexeu, quando, de onde veio e
// por quê. Sem ela o saldo muda e ninguém consegue reconstruir a história.
//
// ─── POR QUE ISTO EXISTE ────────────────────────────────────────────────────
//
// Quatro caminhos alteravam `estoque_atual` sem registrar nada: a venda do
// PDV, o débito de insumo dessa venda, a comanda e a perda. Compra, produção,
// entrega de pedido e ajuste manual registravam.
//
// O efeito só aparece quando se precisa dele. Em 10/08/2026 um pedido foi
// entregue depois de a mesma mercadoria já ter sido vendida no balcão: o
// estoque saiu duas vezes. Ao abrir o extrato do produto para entender,
// aparecia a saída da entrega — e a venda, que era a outra metade da conta,
// simplesmente não estava lá.
//
// ─── REGRA ──────────────────────────────────────────────────────────────────
//
// Quem mexe em `estoque_atual` chama esta função na mesma operação. Sempre.
// Se não houver o que escrever na observação, o movimento não deveria existir.
import { sql } from 'drizzle-orm'
import type { AppDB } from '@/lib/db/connection'

export interface Movimento {
  /** entrada soma no saldo; saida subtrai. Sempre em quantidade positiva. */
  tipo:       'entrada' | 'saida'
  entidade:   'produto' | 'insumo'
  entidadeId: number
  quantidade: number
  /** Custo unitário quando conhecido — compra sabe, venda não. */
  precoCusto?: number
  /** De onde veio o movimento, em português. Aparece no extrato. */
  observacao: string
  userId:     number
}

/**
 * Grava o movimento. Nunca lança.
 *
 * Auditoria não pode derrubar a operação que está auditando: uma venda que
 * falhasse porque o registro do extrato falhou seria pior que a lacuna. O erro
 * vai para o log e a vida segue.
 */
export async function registrarMovimentacao(db: AppDB, m: Movimento): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO t_movimentacao_estoque
        (tipo, entidade, entidade_id, quantidade, preco_custo, observacao,
         data_movimentacao, created_by, updated_by, created_dt, updated_dt,
         active_flg, modification_num)
      VALUES
        (${m.tipo}, ${m.entidade}, ${m.entidadeId}, ${m.quantidade},
         ${m.precoCusto ?? 0}, ${m.observacao},
         NOW(), ${m.userId}, ${m.userId}, NOW(), NOW(), true, 0)
    `)
  } catch (e) {
    console.error('[sistematiza.erp] falha ao registrar movimentacao de estoque', m, e)
  }
}

/** Mesma coisa, para quem já está com um client cru do pool em mãos. */
export async function registrarMovimentacaoNoClient(client: any, m: Movimento): Promise<void> {
  try {
    await client.query(`
      INSERT INTO t_movimentacao_estoque
        (tipo, entidade, entidade_id, quantidade, preco_custo, observacao,
         data_movimentacao, created_by, updated_by, created_dt, updated_dt,
         active_flg, modification_num)
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7, $7, NOW(), NOW(), true, 0)
    `, [m.tipo, m.entidade, m.entidadeId, m.quantidade, m.precoCusto ?? 0, m.observacao, m.userId])
  } catch (e) {
    console.error('[sistematiza.erp] falha ao registrar movimentacao de estoque', m, e)
  }
}
