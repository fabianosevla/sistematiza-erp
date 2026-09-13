// app/api/[tenant]/crm/campanhas/route.ts
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { sql } from 'drizzle-orm'
import { resolveTenant } from '@/lib/auth/tenant'
import { exigirModulo } from '@/lib/auth/permissoes'
import { getDbForTenant } from '@/lib/db/connection'
import { usuarioAtualIdDb } from '@/lib/auth/usuarioAtual'
import { CampanhaService } from '@/lib/services/crm/CampanhaService'
import { ok, badRequest, serverError } from '@/lib/api/responses'

type Params = { params: { tenant: string } }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    await exigirModulo(tenant.schemaName, 'crm')
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const svc = new CampanhaService(db)
      const [config, envios] = await Promise.all([svc.getConfigWhatsapp(), svc.ultimosEnvios()])
      return ok({ pronto: config.pronto, ultimosEnvios: envios })
    } finally { release() }
  } catch (err) { return serverError(err) }
}

const enviarSchema = z.object({
  campanhaNome: z.string().min(2).max(150),
  mensagem:     z.string().min(2).max(1000),
  clienteIds:   z.array(z.number().int()).min(1).max(500),
})

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    await exigirModulo(tenant.schemaName, 'crm')
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const body   = enviarSchema.parse(await req.json())
      const userId = await usuarioAtualIdDb(db)

      const r = await db.execute(sql`
        SELECT cliente_id, nome_completo, COALESCE(celular, telefone) AS telefone
          FROM t_cliente
         WHERE cliente_id = ANY(${body.clienteIds}) AND active_flg = true
      `)
      const publico = (r.rows as any[]).map(c => ({ clienteId: c.cliente_id, nome: c.nome_completo, telefone: c.telefone }))

      const resultado = await new CampanhaService(db).enviar(body.campanhaNome, body.mensagem, publico, userId)
      return ok(resultado)
    } catch (err: any) {
      if (err?.name === 'ZodError') return badRequest('Dados inválidos.')
      return badRequest(err?.message ?? 'Falha ao enviar campanha.')
    } finally { release() }
  } catch (err) { return serverError(err) }
}
