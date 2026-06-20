// app/api/[tenant]/notificacoes/route.ts
import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { sql } from 'drizzle-orm'
import { ok, serverError } from '@/lib/api/responses'

type P = { params: { tenant: string } }

export async function GET(req: NextRequest, { params }: P) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const notifs: { id: string; titulo: string; mensagem: string; lida: boolean; tipo: string }[] = []

      // Estoque crítico — produtos
      const produtosCriticos = await db.execute(sql`
        SELECT produto_id, nome, estoque_atual, estoque_minimo FROM t_produto
        WHERE active_flg = true AND estoque_atual <= estoque_minimo AND estoque_minimo > 0
        LIMIT 5
      `)
      for (const p of produtosCriticos.rows as any[]) {
        notifs.push({
          id: `produto-${p.produto_id}`, tipo: 'estoque',
          titulo: 'Estoque baixo', mensagem: `${p.nome} está com ${p.estoque_atual} (mín. ${p.estoque_minimo})`,
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
          titulo: 'Insumo em falta', mensagem: `${i.nome} está com ${i.estoque_atual} (mín. ${i.estoque_minimo})`,
          lida: false,
        })
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

      return ok(notifs)
    } finally { release() }
  } catch (err) { return serverError(err) }
}