// @ts-nocheck
// app/api/[tenant]/producao/baixar-insumos/route.ts
//
// Baixa de produção. Componentes da ficha com insumo_id < 0 são produtos-insumo:
// nesse caso a baixa é feita em t_produto (estoque do produto-insumo P), NÃO em
// t_insumo. Modelo "só baixa P": os insumos que compõem P só são baixados quando
// você produz P separadamente por esta mesma tela.
import type { NextRequest } from 'next/server'
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

      // 1. Buscar ficha técnica — resolve insumo (t_insumo) OU produto-insumo (t_produto)
      const ficha = await db.execute(sql`
        SELECT
          pi.produto_insumo_id,
          pi.insumo_id,
          COALESCE(i.nome, p.nome)               AS nome_insumo,
          pi.quantidade                          AS qtd_por_unidade,
          pi.unidade,
          COALESCE(i.estoque_atual, p.estoque_atual) AS estoque_atual,
          (pi.insumo_id < 0)                     AS eh_produto
        FROM t_produto_insumo pi
        LEFT JOIN t_insumo  i ON pi.insumo_id = i.insumo_id     AND pi.insumo_id > 0 AND i.active_flg = true
        LEFT JOIN t_produto p ON (-pi.insumo_id) = p.produto_id AND pi.insumo_id < 0 AND p.active_flg = true
        WHERE pi.produto_id = ${produtoId}
          AND pi.active_flg = true
          AND (i.insumo_id IS NOT NULL OR p.produto_id IS NOT NULL)
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
          insumoId:       row.insumo_id,               // negativo = produto-insumo
          ehProduto:      row.eh_produto === true,
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

      // 4. Se confirmar=true, executa a baixa (produto-insumo → t_produto; senão → t_insumo)
      for (const item of itens) {
        const novoEstoque = Math.max(0, item.estoqueRestante)
        if (item.ehProduto) {
          await db.execute(sql`
            UPDATE t_produto
            SET estoque_atual = ${novoEstoque}, updated_dt = NOW(), updated_by = 1
            WHERE produto_id = ${-item.insumoId}
          `)
        } else {
          await db.execute(sql`
            UPDATE t_insumo
            SET estoque_atual = ${novoEstoque}, updated_dt = NOW(), updated_by = 1
            WHERE insumo_id = ${item.insumoId}
          `)
        }
      }

      return ok({
        temFicha: true,
        baixado: true,
        itens,
        quantidade,
        message: `Produção de ${quantidade} unidade(s) registrada. Estoque de insumos/produtos-insumo baixado.`,
      })
    } finally { release() }
  } catch (err) { return serverError(err) }
}