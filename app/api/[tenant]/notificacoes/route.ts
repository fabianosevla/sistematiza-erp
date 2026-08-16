// @ts-nocheck
// ESTE ARQUIVO VAI EM: app/api/[tenant]/notificacoes/route.ts
//
// As notificações continuam sendo CALCULADAS na hora — não existe uma tabela
// de notificações e não faz sentido criar uma: o alerta é um retrato do estado
// atual do estoque e do plano de ação.
//
// O que mudou: agora existe t_notificacao_lida, que registra o que cada
// usuário já viu. O GET cruza com ela e devolve `lida` de verdade; o POST
// marca como lidas as notificações abertas naquele momento.
//
// A leitura é vinculada à MENSAGEM, não só ao alerta. Se a farinha cair de
// 3 kg para 1 kg o texto muda, a assinatura gravada não bate mais e o alerta
// reaparece como novo. Marcar como lido não silencia um problema que piorou.
import type { NextRequest } from 'next/server'
import { idLogado } from '@/lib/auth/identidade'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { sql } from 'drizzle-orm'
import { ok, serverError } from '@/lib/api/responses'

type P = { params: { tenant: string } }

type Notif = {
  id:       string
  tipo:     string
  titulo:   string
  mensagem: string
  lida:     boolean
}

// Quem está olhando. O sino é por pessoa: você marcar como lida não pode
// apagar o alerta de outro usuário do mesmo tenant.
async function usuarioRef(): Promise<string> {
  try {
    return (await idLogado()) ?? 'anon'
  } catch {
    return 'anon'
  }
}

// Fonte única dos alertas. GET e POST usam a mesma função — assim o que é
// marcado como lido é exatamente o que estava na tela, sem o cliente precisar
// mandar a lista de volta (e sem poder mentir sobre ela).
async function calcular(db: any): Promise<Notif[]> {
  const notifs: Notif[] = []

  // Estoque crítico — produtos
  const produtosCriticos = await db.execute(sql`
    SELECT produto_id, nome, estoque_atual, estoque_minimo FROM t_produto
    WHERE active_flg = true AND estoque_atual <= estoque_minimo AND estoque_minimo > 0
    LIMIT 5
  `)
  for (const p of produtosCriticos.rows as any[]) {
    notifs.push({
      id: `produto-${p.produto_id}`, tipo: 'estoque',
      titulo: 'Estoque baixo',
      mensagem: `${p.nome} está com ${p.estoque_atual} (mín. ${p.estoque_minimo})`,
      lida: false,
    })
  }

  // Estoque crítico — insumos
  const insumosCriticos = await db.execute(sql`
    SELECT insumo_id, nome, estoque_atual, estoque_minimo FROM t_insumo
    WHERE active_flg = true AND estoque_atual <= estoque_minimo AND estoque_minimo > 0
    LIMIT 5
  `)
  for (const i of insumosCriticos.rows as any[]) {
    notifs.push({
      id: `insumo-${i.insumo_id}`, tipo: 'estoque',
      titulo: 'Insumo em falta',
      mensagem: `${i.nome} está com ${i.estoque_atual} (mín. ${i.estoque_minimo})`,
      lida: false,
    })
  }

  // Contas a receber VENCIDAS — cobrança do dia a dia.
  //
  // A mensagem inclui os dias de atraso. Como esse número muda todo dia, a
  // assinatura gravada em t_notificacao_lida deixa de bater e o alerta
  // reaparece — é o lembrete diário até a conta ser baixada.
  try {
    const vencidas = await db.execute(sql`
      SELECT conta_receber_id, descricao, nome_cliente,
             (valor_original - valor_recebido) AS saldo,
             data_vencimento::text AS vencimento,
             (CURRENT_DATE - data_vencimento) AS dias_atraso
      FROM t_conta_receber
      WHERE active_flg = true
        AND status = 'aberta'
        AND data_vencimento < CURRENT_DATE
        AND (valor_original - valor_recebido) > 0
      ORDER BY data_vencimento ASC
      LIMIT 10
    `)
    for (const r of vencidas.rows as any[]) {
      const saldo = (Number(r.saldo ?? 0) / 100)
        .toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
      const dias  = Number(r.dias_atraso ?? 0)
      const quem  = String(r.nome_cliente ?? '').trim()
      const venc  = String(r.vencimento ?? '').split('-').reverse().join('/')
      notifs.push({
        id: `receber-${r.conta_receber_id}`, tipo: 'financeiro',
        titulo: 'Conta a receber vencida',
        mensagem: `${quem || r.descricao} — ${saldo}, vencida em ${venc} (${dias} dia${dias === 1 ? '' : 's'} de atraso)`,
        lida: false,
      })
    }
  } catch (_) {
    // Financeiro Completo pode não estar ativo / tabela ausente — ignora
  }

  // Plano de Ação — itens pendentes (atrasados primeiro)
  try {
    const planoAcaoPendente = await db.execute(sql`
      SELECT plano_id, identificacao, acao, responsavel, data_acao,
             (data_acao < CURRENT_DATE) as atrasado
      FROM t_plano_acao
      WHERE active_flg = true AND status = 'pendente'
      ORDER BY data_acao ASC NULLS LAST
      LIMIT 5
    `)
    for (const p of planoAcaoPendente.rows as any[]) {
      notifs.push({
        id: `plano-acao-${p.plano_id}`, tipo: 'plano_acao',
        titulo: p.atrasado ? 'Plano de Ação atrasado' : 'Plano de Ação pendente',
        mensagem: `${p.identificacao || p.acao}${p.responsavel ? ' — ' + p.responsavel : ''}`,
        lida: false,
      })
    }
  } catch (_) {
    // módulo plano de ação pode não estar ativo/tabela pode não existir ainda — ignora
  }

  // Meta em risco — só dispara se o RITMO estiver abaixo do proporcional ao
  // tempo já passado do mês (ex.: no dia 18 de um mês de 30 dias, 60% do mês
  // já passou — só alerta se menos de 60% da meta tiver sido atingido). Isso
  // evita alarme falso no dia 1, quando qualquer meta parece "não batida".
  // Os primeiros dias do mês (< 3) ficam de fora: com pouco dado acumulado,
  // a proporção oscila demais para significar alguma coisa.
  try {
    const hoje        = new Date()
    const mesAtual     = hoje.getMonth() + 1
    const anoAtual     = hoje.getFullYear()
    const diasNoMes    = new Date(anoAtual, mesAtual, 0).getDate()
    const diasPassados = hoje.getDate()

    if (diasPassados >= 3) {
      const proporcaoTempo = diasPassados / diasNoMes
      const metaRes = await db.execute(sql`
        SELECT meta_receita, meta_lucro FROM t_meta
        WHERE mes = ${mesAtual} AND ano = ${anoAtual} AND active_flg = true LIMIT 1
      `)
      const metaRow = (metaRes.rows as any[])[0]
      if (metaRow) {
        const metaReceita = Number(metaRow.meta_receita ?? 0)
        const metaLucro   = Number(metaRow.meta_lucro ?? 0)
        if (metaReceita > 0 || metaLucro > 0) {
          const receitaRes = await db.execute(sql`SELECT COALESCE(SUM(total),0)::bigint as receita FROM t_venda WHERE active_flg=true AND EXTRACT(MONTH FROM vendida_em)=${mesAtual} AND EXTRACT(YEAR FROM vendida_em)=${anoAtual}`)
          const despesaRes = await db.execute(sql`SELECT COALESCE(SUM(valor),0)::bigint as despesa FROM t_despesa WHERE active_flg=true AND mes_competencia=${mesAtual} AND ano_competencia=${anoAtual}`)
          const receita = Number(receitaRes.rows[0]?.receita ?? 0)
          const despesa = Number(despesaRes.rows[0]?.despesa ?? 0)
          const lucro   = receita - despesa

          if (metaReceita > 0) {
            const proporcaoReceita = receita / metaReceita
            if (proporcaoReceita < proporcaoTempo) {
              notifs.push({
                id: 'meta-receita-risco', tipo: 'metas',
                titulo: 'Meta de receita em risco',
                mensagem: `No dia ${diasPassados} de ${diasNoMes} (${Math.round(proporcaoTempo * 100)}% do mês), só ${Math.round(proporcaoReceita * 100)}% da meta de receita foi atingido.`,
                lida: false,
              })
            }
          }
          if (metaLucro > 0) {
            const proporcaoLucro = lucro / metaLucro
            if (proporcaoLucro < proporcaoTempo) {
              notifs.push({
                id: 'meta-lucro-risco', tipo: 'metas',
                titulo: 'Meta de lucro em risco',
                mensagem: `No dia ${diasPassados} de ${diasNoMes} (${Math.round(proporcaoTempo * 100)}% do mês), só ${Math.round(proporcaoLucro * 100)}% da meta de lucro foi atingido.`,
                lida: false,
              })
            }
          }
        }
      }
    }
  } catch (_) {
    // módulo Metas pode não estar ativo/tabela pode não existir ainda — ignora
  }

  return notifs
}

// Lê t_notificacao_lida sem quebrar se o tenant ainda não rodou a migration.
async function lidasDoUsuario(db: any, usuario: string): Promise<Record<string, string>> {
  try {
    const res = await db.execute(sql`
      SELECT notif_key, assinatura FROM t_notificacao_lida
      WHERE usuario_ref = ${usuario}
    `)
    const mapa: Record<string, string> = {}
    for (const r of res.rows as any[]) mapa[r.notif_key] = r.assinatura
    return mapa
  } catch (_) {
    // tabela ainda não existe — trata tudo como não lido
    return {}
  }
}

export async function GET(req: NextRequest, { params }: P) {
  try {
    const tenant  = await resolveTenant(params.tenant)
    const usuario = await usuarioRef()
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const notifs = await calcular(db)
      const lidas  = await lidasDoUsuario(db, usuario)

      // Só conta como lida se a MENSAGEM for a mesma que foi lida.
      for (const n of notifs) n.lida = lidas[n.id] === n.mensagem

      return ok(notifs)
    } finally { release() }
  } catch (err) { return serverError(err) }
}

// Marca como lidas todas as notificações abertas neste instante.
// Chamado pelo sino no Header quando o usuário abre o painel.
export async function POST(req: NextRequest, { params }: P) {
  try {
    const tenant  = await resolveTenant(params.tenant)
    const usuario = await usuarioRef()
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const notifs = await calcular(db)

      for (const n of notifs) {
        // ON CONFLICT porque a mesma pessoa relê o mesmo alerta várias vezes.
        // O UPDATE da assinatura é o que reconhece a leitura da versão nova
        // da mensagem, quando o número mudou desde a última vez.
        await db.execute(sql`
          INSERT INTO t_notificacao_lida (usuario_ref, notif_key, assinatura, lida_dt)
          VALUES (${usuario}, ${n.id}, ${n.mensagem}, NOW())
          ON CONFLICT (usuario_ref, notif_key)
          DO UPDATE SET assinatura = EXCLUDED.assinatura, lida_dt = NOW()
        `)
      }

      return ok({ marcadas: notifs.length })
    } finally { release() }
  } catch (err) { return serverError(err) }
}