// ESTE ARQUIVO VAI EM: app/api/[tenant]/cardapio/route.ts
//
// ROTA PÚBLICA — sem login. Ver middleware.ts (isPublicRoute) e
// lib/auth/tenantPublico.ts. Só devolve o que o cardápio precisa mostrar:
// nome/logo do tenant e os produtos marcados como disponíveis. Nada de
// estoque, custo ou dado de outro cliente passa por aqui.
import type { NextRequest } from 'next/server'
import { resolveTenantPublico } from '@/lib/auth/tenantPublico'
import { pool } from '@/lib/db/connection'
import { ok, notFound, serverError } from '@/lib/api/responses'
import { estaAberto } from '@/lib/cardapio/horario'

type Params = { params: { tenant: string } }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenantPublico(params.tenant)
    if (!tenant) return notFound('Cardápio não disponível')

    const client = await pool.connect()
    try {
      await client.query(`SET search_path TO "${tenant.schemaName}", public`)

      const cfg = await client.query(`
        SELECT nome_fantasia, nome_empresa, logo_base64, telefone, endereco,
               cardapio_mensagem_boas_vindas, cardapio_cor_destaque,
               cardapio_permite_entrega, cardapio_permite_balcao,
               cardapio_layout, cardapio_banner_url, cardapio_taxa_entrega, cardapio_horario
        FROM t_configuracoes_tenant LIMIT 1
      `)
      const c = cfg.rows[0] ?? {}

      const produtos = await client.query(`
        SELECT produto_id, nome, descricao, categoria, unidade, preco_varejo, foto_url
        FROM t_produto
        WHERE active_flg = true AND disponivel_cardapio = true
        ORDER BY categoria NULLS LAST, nome ASC
      `)

      const formas = await client.query(`
        SELECT forma_id, nome FROM t_forma_pagamento
        WHERE active_flg = true ORDER BY nome ASC
      `)

      return ok({
        empresa: {
          nome:      c.nome_fantasia || c.nome_empresa || tenant.name,
          // logo_base64 é a coluna que o Header/Configurações realmente
          // grava — logo_url nunca foi escrita em lugar nenhum, então o
          // cardápio nunca mostrava logo nenhum antes desta correção.
          logoUrl:   c.logo_base64 || null,
          telefone:  c.telefone || null,
          endereco:  c.endereco || null,
        },
        layout: {
          mensagemBoasVindas: c.cardapio_mensagem_boas_vindas || null,
          corDestaque:        c.cardapio_cor_destaque || '#2ecc71',
          tipo:               c.cardapio_layout || 'classico',
          bannerUrl:          c.cardapio_banner_url || null,
        },
        permiteEntrega: c.cardapio_permite_entrega ?? true,
        permiteBalcao:  c.cardapio_permite_balcao ?? true,
        taxaEntrega:    Number(c.cardapio_taxa_entrega ?? 0),
        horario:        c.cardapio_horario ?? null,
        ...estaAberto(c.cardapio_horario),
        produtos: produtos.rows.map(r => ({
          produtoId:   r.produto_id,
          nome:        r.nome,
          descricao:   r.descricao,
          categoria:   r.categoria,
          unidade:     r.unidade,
          precoVarejo: Number(r.preco_varejo ?? 0),
          fotoUrl:     r.foto_url,
        })),
        formasPagamento: formas.rows.map(r => ({ formaId: r.forma_id, nome: r.nome })),
      })
    } finally {
      client.release()
    }
  } catch (err) {
    return serverError(err)
  }
}
