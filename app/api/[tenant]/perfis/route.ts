// app/api/[tenant]/perfis/route.ts
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { usuarioAtualIdDb } from '@/lib/auth/usuarioAtual'
import { PerfisService } from '@/lib/services/perfis/PerfisService'
import { ok, created, serverError } from '@/lib/api/responses'

type Params = { params: { tenant: string } }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      return ok(await new PerfisService(db).list())
    } finally { release() }
  } catch (err) { return serverError(err) }
}

const schema = z.object({
  nome:      z.string().min(2).max(100),
  descricao: z.string().max(300).optional(),

  acessoGerencial: z.boolean().default(false),
  acessoPdv:       z.boolean().default(false),
  acessoComanda:   z.boolean().default(false),
  acessoDelivery:  z.boolean().default(false),

  moduloDashboard:  z.boolean().default(true),
  moduloCadastros:  z.boolean().default(true),
  moduloVendas:     z.boolean().default(true),
  moduloFinanceiro: z.boolean().default(false),
  moduloEstoque:    z.boolean().default(false),
  moduloProducao:   z.boolean().default(false),
  moduloPedidos:    z.boolean().default(false),
  moduloComandas:   z.boolean().default(false),
  moduloConsultas:  z.boolean().default(false),
  moduloFiscal:     z.boolean().default(false),
  moduloPlanoAcao:  z.boolean().default(false),
  moduloMetas:      z.boolean().default(false),
  moduloFidelidade: z.boolean().default(false),
  moduloUsuarios:   z.boolean().default(false),
  // Compras
  moduloCompras:    z.boolean().default(false),

  percDescontoMax:  z.number().min(0).max(100).default(0),
  valorDescontoMax: z.number().int().min(0).default(0),
  isAdmin:          z.boolean().default(false),
})

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const payload = schema.parse(await req.json())
      const uid = await usuarioAtualIdDb(db)   // antes: literal 1
      return created(await new PerfisService(db).criar({
        ...payload,
        percDescontoMax: String(payload.percDescontoMax),
        activeFlag: true,
      }, uid))
    } finally { release() }
  } catch (err) { return serverError(err) }
}