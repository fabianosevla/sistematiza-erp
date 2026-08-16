// ESTE ARQUIVO VAI EM: app/api/[tenant]/cardapio/mensagem/route.ts
//
// ROTA PÚBLICA — sem login. Ver middleware.ts (isPublicRoute).
//
// Substitui a antiga app/api/[tenant]/cardapio/pedido/route.ts. O cardápio
// não cria mais pedido nem cliente sozinho: ele só monta a mensagem do
// WhatsApp com o pedido formatado. Quem confirma e registra no sistema
// (pedido, PDV, delivery — o que fizer sentido) é a loja, depois de
// combinar com o cliente pelo WhatsApp.
//
// PREÇO NUNCA VEM DO NAVEGADOR — mesmo critério da rota antiga: o cliente
// manda só produtoId + quantidade, o preço é buscado de novo aqui.
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { resolveTenantPublico } from '@/lib/auth/tenantPublico'
import { getDbForTenant, pool } from '@/lib/db/connection'
import { dbProduto } from '@/lib/db/schemas/cadastros'
import { fmtMoeda } from '@/lib/format'
import { ok, notFound, badRequest, serverError } from '@/lib/api/responses'

type Params = { params: { tenant: string } }

const mensagemSchema = z.object({
  nome:            z.string().min(2).max(200),
  tipoVenda:       z.enum(['balcao', 'entrega']).default('entrega'),
  enderecoEntrega: z.string().max(300).optional().nullable(),
  observacao:      z.string().max(500).optional().nullable(),
  formaPagamentoNome: z.string().max(100).optional().nullable(),
  itens: z.array(z.object({
    produtoId:  z.number().int(),
    quantidade: z.number().int().min(1),
  })).min(1),
}).superRefine((dados, ctx) => {
  if (dados.tipoVenda === 'entrega' && !dados.enderecoEntrega?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['enderecoEntrega'], message: 'Informe o endereço de entrega' })
  }
})

/** Normaliza pra formato que o wa.me aceita: só dígitos, com DDI 55 na frente. */
function normalizarWhatsapp(valor: string): string {
  const digitos = valor.replace(/\D/g, '')
  if (digitos.length === 10 || digitos.length === 11) return `55${digitos}`
  return digitos
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenantPublico(params.tenant)
    if (!tenant) return notFound('Cardápio não disponível')

    const body    = await req.json()
    const payload = mensagemSchema.parse(body)

    const client = await pool.connect()
    let nomeEmpresa = ''
    let whatsappLoja = ''
    try {
      await client.query(`SET search_path TO "${tenant.schemaName}", public`)
      const cfg = await client.query(`
        SELECT nome_fantasia, nome_empresa, cardapio_whatsapp, telefone
        FROM t_configuracoes_tenant LIMIT 1
      `)
      const c = cfg.rows[0] ?? {}
      nomeEmpresa  = c.nome_fantasia || c.nome_empresa || tenant.name
      whatsappLoja = c.cardapio_whatsapp || c.telefone || ''
    } finally {
      client.release()
    }

    if (!whatsappLoja.trim()) {
      return badRequest('O cardápio ainda não tem um WhatsApp configurado para receber pedidos.')
    }

    const { db, release } = await getDbForTenant(tenant.schemaName)
    let itensComPreco: { nome: string; quantidade: number; precoUnitario: number }[] = []
    try {
      const produtosDisponiveis = await db.select().from(dbProduto)
      const mapaProdutos = new Map(produtosDisponiveis.map(p => [p.produtoId, p]))

      itensComPreco = payload.itens.map(item => {
        const produto = mapaProdutos.get(item.produtoId)
        if (!produto || !produto.disponivelCardapio || !produto.activeFlag) {
          throw new Error(`PRODUTO_INDISPONIVEL:${item.produtoId}`)
        }
        return { nome: produto.nome, quantidade: item.quantidade, precoUnitario: produto.precoVarejo }
      })
    } finally {
      release()
    }

    const total = itensComPreco.reduce((soma, i) => soma + i.quantidade * i.precoUnitario, 0)

    const linhasItens = itensComPreco
      .map(i => `${i.quantidade}x ${i.nome} — ${fmtMoeda(i.quantidade * i.precoUnitario)}`)
      .join('\n')

    const linhasEntrega = payload.tipoVenda === 'entrega'
      ? `📍 Entrega: ${payload.enderecoEntrega}`
      : `🏠 Retirada no balcão`

    const linhas = [
      `Olá! 😊 Me chamo *${payload.nome}* e gostaria de fazer um pedido na ${nomeEmpresa}:`,
      ``,
      `🧺 *Pedido:*`,
      linhasItens,
      ``,
      `💰 *Total: ${fmtMoeda(total)}*`,
      ``,
      linhasEntrega,
    ]
    if (payload.formaPagamentoNome) linhas.push(`💳 Forma de pagamento: ${payload.formaPagamentoNome}`)
    if (payload.observacao?.trim()) linhas.push(`📝 Obs: ${payload.observacao.trim()}`)
    linhas.push(``, `Aguardando a confirmação da loja. Obrigado(a)! 🙏`)

    const mensagem = linhas.join('\n')
    const numero   = normalizarWhatsapp(whatsappLoja)
    const linkWhatsapp = `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`

    return ok({ mensagem, linkWhatsapp, total })
  } catch (err: any) {
    if (typeof err?.message === 'string' && err.message.startsWith('PRODUTO_INDISPONIVEL:')) {
      return badRequest('Um dos produtos do pedido não está mais disponível.')
    }
    return serverError(err)
  }
}
