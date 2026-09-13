// app/api/[tenant]/cardapio/evento/route.ts
//
// ROTA PÚBLICA — sem login. Ver middleware.ts (isPublicRoute).
//
// Registra dois eventos do funil do cardápio digital: 'visualizacao' (ao
// abrir a página) e 'pedido_montado' (quando o POST /mensagem responde com
// sucesso, ou seja, o cliente chegou a montar o carrinho e pegou o link do
// WhatsApp). Não sabe se virou venda de verdade — isso é calculado à parte,
// por t_pedido.origem = 'cardapio' (ver CardapioAnaliticaService).
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import crypto from 'crypto'
import { resolveTenantPublico } from '@/lib/auth/tenantPublico'
import { pool } from '@/lib/db/connection'
import { ok, notFound, badRequest, tooManyRequests, serverError } from '@/lib/api/responses'
import { checarLimite } from '@/lib/api/rateLimit'

type Params = { params: { tenant: string } }

const eventoSchema = z.object({
  tipo: z.enum(['visualizacao', 'pedido_montado']),
})

function ipHash(req: Request): string {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'desconhecido'
  return crypto.createHash('sha256').update(ip).digest('hex').slice(0, 64)
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    // Mesmo limite do GET público do cardápio — não é ação de checkout,
    // não precisa de limite tão apertado quanto /mensagem.
    const limite = checarLimite(req, 'cardapio-evento', { limite: 30, janelaMs: 60_000 })
    if (!limite.permitido) return tooManyRequests()

    const tenant = await resolveTenantPublico(params.tenant)
    if (!tenant) return notFound('Cardápio não disponível')

    const body = eventoSchema.parse(await req.json())

    const client = await pool.connect()
    try {
      await client.query(`SET search_path TO "${tenant.schemaName}", public`)
      await client.query(
        `INSERT INTO t_cardapio_evento (tipo, ip_hash, ocorrido_em, created_by, updated_by, created_dt, updated_dt)
         VALUES ($1, $2, NOW(), 1, 1, NOW(), NOW())`,
        [body.tipo, ipHash(req)],
      )
      return ok({ registrado: true })
    } finally { client.release() }
  } catch (err: any) {
    if (err?.name === 'ZodError') return badRequest('Dados inválidos.')
    return serverError(err)
  }
}
