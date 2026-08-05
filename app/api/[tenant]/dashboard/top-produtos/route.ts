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
import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { pool } from '@/lib/db/connection'
import { ok, serverError } from '@/lib/api/responses'

type Params = { params: { tenant: string } }

// Início do recorte, sempre a partir de agora para trás.
//   dia    → hoje, desde a meia-noite
//   semana → segunda-feira desta semana
//   mes    → dia 1º deste mês
function inicioDe(periodo: string) {
  const agora = new Date()
  const hoje  = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate())

  if (periodo === 'dia') return hoje
  if (periodo === 'mes') return new Date(agora.getFullYear(), agora.getMonth(), 1)

  // semana: getDay() devolve 0 para domingo, que precisa recuar 6 dias
  const diaSemana = hoje.getDay()
  const recuo     = diaSemana === 0 ? 6 : diaSemana - 1
  const segunda   = new Date(hoje)
  segunda.setDate(hoje.getDate() - recuo)
  return segunda
}

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const client = await pool.connect()
    try {
      await client.query(`SET search_path TO "${tenant.schemaName}", public`)

      const { searchParams } = new URL(req.url)
      const periodo = searchParams.get('periodo') ?? 'semana'
      const limite  = Math.min(20, Math.max(3, Number(searchParams.get('limite') ?? 8)))
      const inicio  = inicioDe(periodo)

      const r = await client.query(`
        SELECT vi.nome_produto                      AS nome,
               SUM(vi.quantidade)::numeric          AS qtd,
               SUM(vi.subtotal)::bigint             AS valor
        FROM t_venda_item vi
        JOIN t_venda v ON v.venda_id = vi.venda_id AND v.active_flg = true
        WHERE v.vendida_em >= $1
        GROUP BY vi.nome_produto
        ORDER BY qtd DESC, valor DESC
        LIMIT $2
      `, [inicio.toISOString(), limite])

      const itens = r.rows.map(row => ({
        nome:  row.nome,
        qtd:   Number(row.qtd ?? 0),
        valor: Number(row.valor ?? 0),   // centavos
      }))

      return ok({
        periodo,
        desde: inicio.toISOString(),
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
