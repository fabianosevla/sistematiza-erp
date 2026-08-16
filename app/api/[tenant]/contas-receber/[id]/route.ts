// app/api/[tenant]/contas-receber/[id]/route.ts
import type { NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'
import { resolveTenant } from '@/lib/auth/tenant'
import { exigirModulo } from '@/lib/auth/permissoes'
import { getDbForTenant } from '@/lib/db/connection'
import { dbContaReceber } from '@/lib/db/schemas/financeiro-completo'
import { usuarioAtualIdDb } from '@/lib/auth/usuarioAtual'
import { ContasReceberService } from '@/lib/services/financeiro/ContasReceberService'
import { ok, serverError, notFound } from '@/lib/api/responses'

type P = { params: { tenant: string; id: string } }

// O TOTAL NÃO É MAIS DIGITADO — ele é calculado.
//
//   valor_original = valor_base - desconto + acrescimo
//
// Editar o total diretamente permitia mudar o valor de uma cobrança sem deixar
// registro do motivo. Com os ajustes separados, o porquê fica gravado, e o
// desconto de uma venda vindo de pedido chega intacto na venda gerada na baixa.
//
// Os campos vêm em reais e são convertidos aqui; o banco guarda centavos.
export async function PUT(req: NextRequest, { params }: P) {
  try {
    const tenant = await resolveTenant(params.tenant)
    await exigirModulo(tenant.schemaName, 'financeiro')
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const body   = await req.json()
      const id     = Number(params.id)
      const userId = await usuarioAtualIdDb(db)

      const [atual] = await db.select().from(dbContaReceber)
        .where(eq(dbContaReceber.contaReceberId, id))
      if (!atual) return notFound('Conta a receber não encontrada')

      const cent = (v: any) => Math.round((Number(v) || 0) * 100)

      // Conta antiga pode não ter valor_base preenchido; nesse caso o próprio
      // valor_original serve de base.
      const base      = body.valorBase !== undefined ? cent(body.valorBase)
                      : (atual.valorBase ?? atual.valorOriginal)
      const desconto  = body.desconto  !== undefined ? cent(body.desconto)  : (atual.desconto  ?? 0)
      const acrescimo = body.acrescimo !== undefined ? cent(body.acrescimo) : (atual.acrescimo ?? 0)

      const [result] = await db.update(dbContaReceber).set({
        descricao:        body.descricao        ?? atual.descricao,
        nomeCliente:      body.nomeCliente      ?? atual.nomeCliente,
        categoria:        body.categoria        ?? atual.categoria,
        numeroDocumento:  body.numeroDocumento  ?? atual.numeroDocumento,
        dataEmissao:      body.dataEmissao      ?? atual.dataEmissao,
        dataVencimento:   body.dataVencimento   ?? atual.dataVencimento,
        formaRecebimento: body.formaRecebimento ?? atual.formaRecebimento,
        observacao:       body.observacao       ?? atual.observacao,
        valorBase:        base,
        desconto,
        acrescimo,
        // Nunca negativo: acréscimo maior que a base é erro de digitação, e
        // cobrança negativa quebraria o status e os KPIs.
        valorOriginal:    Math.max(0, base - desconto + acrescimo),
        updatedDt: new Date(),
        updatedBy: userId,
      }).where(eq(dbContaReceber.contaReceberId, id))
        .returning({ id: dbContaReceber.contaReceberId })
      return ok(result)
    } finally { release() }
  } catch (err) { return serverError(err) }
}

export async function DELETE(req: NextRequest, { params }: P) {
  try {
    const tenant = await resolveTenant(params.tenant)
    await exigirModulo(tenant.schemaName, 'financeiro')
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      return ok(await new ContasReceberService(db).excluir(Number(params.id), 1))
    } finally { release() }
  } catch (err) { return serverError(err) }
}