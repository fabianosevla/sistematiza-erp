// ESTE ARQUIVO VAI EM: app/api/[tenant]/cardapio/banner/route.ts
//
// Upload da foto de fundo/capa do Cardápio Digital. Mesmo padrão da foto de
// produto (app/api/[tenant]/cadastros/produtos/[id]/foto/route.ts) — rota
// AUTENTICADA, exige admin (é ajuste de layout, mesma régua do resto da
// tela de Cardápio Digital).
import type { NextRequest } from 'next/server'
import { put, del } from '@vercel/blob'
import { resolveTenant } from '@/lib/auth/tenant'
import { exigirAdmin } from '@/lib/auth/permissoes'
import { pool } from '@/lib/db/connection'
import { ok, badRequest, serverError } from '@/lib/api/responses'

type Params = { params: { tenant: string } }

const TIPOS_ACEITOS = ['image/jpeg', 'image/png', 'image/webp']
const TAMANHO_MAXIMO = 5 * 1024 * 1024

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    await exigirAdmin(tenant.schemaName)
    const form   = await req.formData()
    const file   = form.get('file') as File | null

    if (!file) return badRequest('Nenhum arquivo enviado')
    if (!TIPOS_ACEITOS.includes(file.type)) return badRequest('Use JPG, PNG ou WEBP')
    if (file.size > TAMANHO_MAXIMO) return badRequest('Imagem acima de 5 MB')

    const extensao = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
    const caminho  = `cardapio/${tenant.schemaName}/banner-${Date.now()}.${extensao}`

    const blob = await put(caminho, file, { access: 'public' })

    const client = await pool.connect()
    try {
      await client.query(`SET search_path TO "${tenant.schemaName}", public`)
      await client.query(`UPDATE t_configuracoes_tenant SET cardapio_banner_url = $1`, [blob.url])
      return ok({ bannerUrl: blob.url })
    } finally {
      client.release()
    }
  } catch (err) {
    return serverError(err)
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    await exigirAdmin(tenant.schemaName)
    const client = await pool.connect()
    try {
      await client.query(`SET search_path TO "${tenant.schemaName}", public`)
      const atual = await client.query(`SELECT cardapio_banner_url FROM t_configuracoes_tenant LIMIT 1`)
      const urlAtual = atual.rows[0]?.cardapio_banner_url as string | null

      if (urlAtual) {
        await del(urlAtual).catch(() => {})
      }

      await client.query(`UPDATE t_configuracoes_tenant SET cardapio_banner_url = NULL`)
      return ok({ bannerUrl: null })
    } finally {
      client.release()
    }
  } catch (err) {
    return serverError(err)
  }
}
