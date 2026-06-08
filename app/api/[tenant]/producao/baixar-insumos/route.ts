// @ts-nocheck
import type { NextRequest } from 'next/server'
import { eq, and } from 'drizzle-orm'
import { sql } from 'drizzle-orm'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { ok, serverError } from '@/lib/api/responses'

type Params = { params: { tenant: string } }

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const { produtoId, quantidade, confirmar = false } = await req.json()

      // 1. Buscar ficha técnica do produto
      const ficha = await db.execute(sql`
        SELECT
          pi.produto_insumo_id,
          pi.insumo_id,
          i.nome AS nome_insumo,
          pi.quantidade AS qtd_por_unidade,
          pi.unidade,
          i.estoque_atual
        FROM t_produto_insumo pi
        JOIN t_insumo i ON pi.insumo_id = i.insumo_id
        WHERE pi.produto_id = ${produtoId}
          AND pi.active_flg = true
          AND i.active_flg = true
      `)

      if ((ficha.rows as any[]).length === 0) {
        return ok({
          temFicha: false,
          message: 'Produto não possui ficha técnica cadastrada. Cadastre os insumos na ficha técnica do produto antes de registrar produção.',
          itens: [],
        })
      }

      // 2. Calcular o que será consumido
      const itens = (ficha.rows as any[]).map(row => {
        const qtdNecessaria   = parseFloat(String(row.qtd_por_unidade)) * Number(quantidade)
        const estoqueAtual    = parseFloat(String(row.estoque_atual))
        const estoqueRestante = estoqueAtual - qtdNecessaria
        return {
          insumoId:       row.insumo_id,
          nomeInsumo:     row.nome_insumo,
          qtdNecessaria,
          unidade:        row.unidade,
          estoqueAtual,
          estoqueRestante,
          suficiente:     estoqueAtual >= qtdNecessaria,
        }
      })

      // 3. Se só preview, retorna sem baixar
      if (!confirmar) {
        return ok({ temFicha: true, itens, quantidade })
      }

      // 4. Se confirmar=true, executa a baixa
      for (const item of itens) {
        const novoEstoque = Math.max(0, item.estoqueRestante)
        await db.execute(sql`
          UPDATE t_insumo
          SET estoque_atual = ${novoEstoque},
              updated_dt = NOW(),
              updated_by = 1
          WHERE insumo_id = ${item.insumoId}
        `)
      }

      return ok({
        temFicha: true,
        baixado: true,
        itens,
        quantidade,
        message: `Produção de ${quantidade} unidade(s) registrada. Insumos baixados do estoque.`,
      })
    } finally { release() }
  } catch (err) { return serverError(err) }
}