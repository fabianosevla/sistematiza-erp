// app/api/[tenant]/cardapio/config/route.ts
//
// Configuração do Cardápio Digital (menu próprio, autenticado — não confundir
// com app/api/[tenant]/cardapio/route.ts, que é a rota PÚBLICA sem login).
// Tela inteira é configuração/setup, então trava por admin nos dois verbos —
// mesmo critério já usado em Configurações.
import type { NextRequest } from 'next/server'
import { pool } from '@/lib/db/connection'
import { resolveTenant } from '@/lib/auth/tenant'
import { exigirAdmin } from '@/lib/auth/permissoes'
import { ok, serverError } from '@/lib/api/responses'

type Params = { params: { tenant: string } }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    await exigirAdmin(tenant.schemaName)
    const client = await pool.connect()
    try {
      await client.query(`SET search_path TO "${tenant.schemaName}", public`)
      const result = await client.query(`SELECT * FROM t_configuracoes_tenant LIMIT 1`)
      const r = result.rows[0] ?? {}
      return ok({
        cardapioAtivo:            r.cardapio_ativo            ?? false,
        mensagemBoasVindas:       r.cardapio_mensagem_boas_vindas ?? '',
        corDestaque:              r.cardapio_cor_destaque     ?? '#2ecc71',
        whatsapp:                 r.cardapio_whatsapp         ?? '',
        permiteEntrega:           r.cardapio_permite_entrega  ?? true,
        permiteBalcao:            r.cardapio_permite_balcao   ?? true,
        layout:                   r.cardapio_layout           ?? 'classico',
        bannerUrl:                r.cardapio_banner_url       ?? null,
      })
    } finally { client.release() }
  } catch (err) { return serverError(err) }
}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    await exigirAdmin(tenant.schemaName)
    const body   = await req.json()
    const client = await pool.connect()
    try {
      await client.query(`SET search_path TO "${tenant.schemaName}", public`)

      const updates: [string, any][] = [
        ['cardapio_ativo',                 body.cardapioAtivo],
        ['cardapio_mensagem_boas_vindas',  body.mensagemBoasVindas],
        ['cardapio_cor_destaque',          body.corDestaque],
        ['cardapio_whatsapp',              body.whatsapp],
        ['cardapio_permite_entrega',       body.permiteEntrega],
        ['cardapio_permite_balcao',        body.permiteBalcao],
        ['cardapio_layout',                body.layout],
      ]

      for (const [col, val] of updates) {
        if (val === undefined) continue
        await client.query(`UPDATE t_configuracoes_tenant SET ${col} = $1`, [val])
      }

      return ok({ updated: true })
    } finally { client.release() }
  } catch (err) { return serverError(err) }
}
