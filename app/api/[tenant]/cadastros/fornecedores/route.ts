// ESTE ARQUIVO VAI EM: app/api/[tenant]/cadastros/fornecedores/route.ts
import type { NextRequest } from 'next/server'
import { sql } from 'drizzle-orm'
import { resolveTenant } from '@/lib/auth/tenant'
import { exigirModulo } from '@/lib/auth/permissoes'
import { getDbForTenant } from '@/lib/db/connection'
import { usuarioAtualIdDb } from '@/lib/auth/usuarioAtual'
import { fornecedorInsertSchema } from '@/lib/validations/cadastros'
import { FornecedorService } from '@/lib/services/cadastros/FornecedorService'
import { ok, created, serverError, badRequest } from '@/lib/api/responses'

type Params = { params: { tenant: string } }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const { searchParams } = new URL(req.url)
      const page   = Math.max(1, Number(searchParams.get('page') ?? 1))
      const limit  = Math.min(100, Math.max(1, Number(searchParams.get('limit') ?? 20)))
      const search = searchParams.get('search') ?? undefined
      const service = new FornecedorService(db)
      const result  = await service.list({ page, limit, search })
      return ok(result)
    } finally {
      release()
    }
  } catch (err) {
    return serverError(err)
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    await exigirModulo(tenant.schemaName, 'cadastros')
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const body    = await req.json()
      const payload = fornecedorInsertSchema.parse(body)

      // Impede cadastro duplicado: chave = cnpj/cpf (comparando só dígitos).
      const doc = (body.cnpjCpf ?? (payload as any).cnpjCpf ?? '').toString().trim()
      if (doc) {
        const dup = await db.execute(sql`
          SELECT 1 FROM t_fornecedor
          WHERE active_flg = true
            AND REGEXP_REPLACE(COALESCE(cnpj_cpf,''), '[^0-9]', '', 'g') = REGEXP_REPLACE(${doc}, '[^0-9]', '', 'g')
            AND REGEXP_REPLACE(${doc}, '[^0-9]', '', 'g') <> ''
          LIMIT 1`)
        if (dup.rows.length > 0) return badRequest('Registro já existente')
      }

      const uid     = await usuarioAtualIdDb(db)   // antes: literal 1
      const service = new FornecedorService(db)
      const result  = await service.create(payload, uid)
      return created(result)
    } finally {
      release()
    }
  } catch (err: any) {
    if (err?.code === '23505') return badRequest('Registro já existente')
    return serverError(err)
  }
}