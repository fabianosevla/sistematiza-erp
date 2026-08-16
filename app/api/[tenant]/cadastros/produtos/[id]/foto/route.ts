// ESTE ARQUIVO VAI EM: app/api/[tenant]/cadastros/produtos/[id]/foto/route.ts
//
// Upload da foto do produto para o cardápio online. Rota AUTENTICADA — só o
// gerencial sobe foto, o cardápio público só lê a URL salva.
//
// Vai para o Vercel Blob porque a Vercel não tem disco persistente: salvar
// em app/public sumiria no próximo deploy.
import type { NextRequest } from 'next/server'
import { put } from '@vercel/blob'
import { resolveTenant } from '@/lib/auth/tenant'
import { exigirModulo } from '@/lib/auth/permissoes'
import { getDbForTenant } from '@/lib/db/connection'
import { usuarioAtualIdDb } from '@/lib/auth/usuarioAtual'
import { ProdutoService } from '@/lib/services/cadastros/ProdutoService'
import { ok, badRequest, notFound, serverError } from '@/lib/api/responses'

type Params = { params: { tenant: string; id: string } }

const TIPOS_ACEITOS = ['image/jpeg', 'image/png', 'image/webp']
const TAMANHO_MAXIMO = 5 * 1024 * 1024

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    await exigirModulo(tenant.schemaName, 'cadastros')
    const form   = await req.formData()
    const file   = form.get('file') as File | null

    if (!file) return badRequest('Nenhum arquivo enviado')
    if (!TIPOS_ACEITOS.includes(file.type)) return badRequest('Use JPG, PNG ou WEBP')
    if (file.size > TAMANHO_MAXIMO) return badRequest('Imagem acima de 5 MB')

    const extensao = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
    const caminho  = `cardapio/${tenant.schemaName}/produto-${params.id}-${Date.now()}.${extensao}`

    const blob = await put(caminho, file, { access: 'public' })

    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const uid     = await usuarioAtualIdDb(db)
      const service = new ProdutoService(db)
      const result  = await service.update(Number(params.id), { fotoUrl: blob.url }, uid)
      if ('error' in result) return notFound('Produto não encontrado')
      return ok({ fotoUrl: blob.url })
    } finally {
      release()
    }
  } catch (err) {
    return serverError(err)
  }
}
