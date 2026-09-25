// @ts-nocheck
// ESTE ARQUIVO VAI EM: app/api/[tenant]/cadastros/clientes/[id]/capacidade/route.ts
//
// Capacidade do cliente por produto — base do pedido in loco (QA #49).
//
//   GET → [{ produtoId, nome, unidade, capacidade, precoVarejo, precoAtacado* }]
//   PUT → { itens: [{ produtoId, capacidade }] } substitui a lista inteira
//
// SQL cru: t_cliente_capacidade entra por script (migrate-cliente-capacidade)
// e não está no schema do Drizzle. Sem a tabela, o GET devolve lista vazia
// em vez de quebrar a tela de Pedidos.
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { sql } from 'drizzle-orm'
import { resolveTenant } from '@/lib/auth/tenant'
import { exigirModulo } from '@/lib/auth/permissoes'
import { getDbForTenant } from '@/lib/db/connection'
import { usuarioAtualIdDb } from '@/lib/auth/usuarioAtual'
import { ok, serverError } from '@/lib/api/responses'

type Params = { params: { tenant: string; id: string } }

const TABELA_AUSENTE = '42P01'

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    await exigirModulo(tenant.schemaName, 'pedidos')
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const res = await db.execute(sql`
        SELECT cc.produto_id, cc.capacidade,
               p.nome, p.unidade, p.preco_varejo, p.preco_atacado,
               p.preco_atacado_a, p.preco_atacado_b, p.preco_atacado_c,
               p.preco_atacado_d, p.preco_atacado_e
          FROM t_cliente_capacidade cc
          JOIN t_produto p ON p.produto_id = cc.produto_id AND p.active_flg = true
         WHERE cc.cliente_id = ${Number(params.id)} AND cc.active_flg = true
         ORDER BY p.nome
      `).catch((e: any) => {
        if (e?.code === TABELA_AUSENTE || e?.cause?.code === TABELA_AUSENTE) return { rows: [] }
        throw e
      })
      return ok((res.rows as any[]).map(r => ({
        produtoId:     Number(r.produto_id),
        nome:          r.nome,
        unidade:       r.unidade,
        capacidade:    Number(r.capacidade ?? 0),
        precoVarejo:   Number(r.preco_varejo ?? 0),
        precoAtacado:  Number(r.preco_atacado ?? 0),
        precoAtacadoA: Number(r.preco_atacado_a ?? 0),
        precoAtacadoB: Number(r.preco_atacado_b ?? 0),
        precoAtacadoC: Number(r.preco_atacado_c ?? 0),
        precoAtacadoD: Number(r.preco_atacado_d ?? 0),
        precoAtacadoE: Number(r.preco_atacado_e ?? 0),
      })))
    } finally {
      release()
    }
  } catch (err) {
    return serverError(err)
  }
}

const putSchema = z.object({
  itens: z.array(z.object({
    produtoId:  z.number().int(),
    capacidade: z.number().int().min(0),
  })),
})

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    await exigirModulo(tenant.schemaName, 'pedidos')
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const { itens } = putSchema.parse(await req.json())
      const clienteId = Number(params.id)
      const uid       = await usuarioAtualIdDb(db)

      await db.execute(sql`BEGIN`)
      try {
        // Substitui a lista: o que saiu da tela é inativado; o que ficou é
        // gravado (ou reativado) com a capacidade nova.
        await db.execute(sql`
          UPDATE t_cliente_capacidade
             SET active_flg = false, updated_dt = NOW(), updated_by = ${uid},
                 modification_num = modification_num + 1
           WHERE cliente_id = ${clienteId} AND active_flg = true
        `)
        for (const it of itens) {
          await db.execute(sql`
            INSERT INTO t_cliente_capacidade
              (cliente_id, produto_id, capacidade, created_by, updated_by,
               created_dt, updated_dt, active_flg, modification_num)
            VALUES
              (${clienteId}, ${it.produtoId}, ${it.capacidade}, ${uid}, ${uid},
               NOW(), NOW(), true, 0)
            ON CONFLICT (cliente_id, produto_id) DO UPDATE
               SET capacidade = EXCLUDED.capacidade, active_flg = true,
                   updated_dt = NOW(), updated_by = EXCLUDED.updated_by,
                   modification_num = t_cliente_capacidade.modification_num + 1
          `)
        }
        await db.execute(sql`COMMIT`)
      } catch (e) {
        await db.execute(sql`ROLLBACK`)
        throw e
      }
      return ok({ clienteId, itens: itens.length })
    } finally {
      release()
    }
  } catch (err) {
    return serverError(err)
  }
}
