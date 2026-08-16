// @ts-nocheck
// ESTE ARQUIVO VAI EM: app/api/[tenant]/dashboard/top-produtos/route.ts
//
// Ranking de produtos mais vendidos, com recorte próprio de período.
//
// Por que uma rota separada em vez de um parâmetro na rota do dashboard: o
// dashboard devolve tudo numa tacada só (faturamento, despesas, estoque
// crítico, formas de pagamento). Se o seletor dia/semana/mês vivesse lá,
// trocar o período do ranking recarregaria a tela inteira — quatro consultas
// pesadas para atualizar uma lista.
//
//   GET ?periodo=dia | semana | mes   (padrão: semana)
//
// O início do período é calculado DENTRO do Postgres, a partir de
// NOW() AT TIME ZONE 'America/Sao_Paulo' — não em JS. Calcular em JS usava o
// fuso do processo Node, que na Vercel roda em UTC: perto da virada da meia-
// noite em São Paulo (que fica 3h atrás de UTC), "hoje" no servidor já podia
// ser outro dia, e o ranking do dia aparecia zerado com venda de verdade no
// banco. Ver histórico do dashboard principal, mesmo bug.
import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { exigirModulo } from '@/lib/auth/permissoes'
import { pool } from '@/lib/db/connection'
import { ok, serverError } from '@/lib/api/responses'

type Params = { params: { tenant: string } }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    await exigirModulo(tenant.schemaName, 'dashboard')
    const client = await pool.connect()
    try {
      await client.query(`SET search_path TO "${tenant.schemaName}", public`)

      const { searchParams } = new URL(req.url)
      const periodo = searchParams.get('periodo') ?? 'semana'
      const limite  = Math.min(20, Math.max(3, Number(searchParams.get('limite') ?? 8)))

      // DATE_TRUNC('week', ...) do Postgres começa na segunda-feira, mesma
      // regra que o código antigo calculava à mão em JS.
      const truncPor = periodo === 'dia' ? 'day' : periodo === 'mes' ? 'month' : 'week'

      const r = await client.query(`
        SELECT vi.nome_produto                      AS nome,
               SUM(vi.quantidade)::numeric          AS qtd,
               SUM(vi.subtotal)::bigint             AS valor
        FROM t_venda_item vi
        JOIN t_venda v ON v.venda_id = vi.venda_id AND v.active_flg = true
        WHERE (v.vendida_em AT TIME ZONE 'America/Sao_Paulo')
              >= DATE_TRUNC('${truncPor}', NOW() AT TIME ZONE 'America/Sao_Paulo')
        GROUP BY vi.nome_produto
        ORDER BY qtd DESC, valor DESC
        LIMIT $1
      `, [limite])

      const itens = r.rows.map(row => ({
        nome:  row.nome,
        qtd:   Number(row.qtd ?? 0),
        valor: Number(row.valor ?? 0),   // centavos
      }))

      return ok({
        periodo,
        itens,
        // O maior serve de referência para a barra de proporção na tela; sem
        // ele o componente teria que percorrer a lista de novo a cada render.
        maiorQtd: itens.length > 0 ? Math.max(...itens.map(i => i.qtd)) : 0,
      })
    } finally {
      client.release()
    }
  } catch (err) {
    return serverError(err)
  }
}
