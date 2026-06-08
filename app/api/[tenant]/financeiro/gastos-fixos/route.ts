// @ts-nocheck
import type { NextRequest } from 'next/server'
import { eq, and } from 'drizzle-orm'
import { sql } from 'drizzle-orm'
import { resolveTenant } from '@/lib/auth/tenant'
import { getDbForTenant } from '@/lib/db/connection'
import { dbGastoFixoCategoria, dbGastoFixoValor } from '@/lib/db/schemas/financeiro'
import { FinanceiroService } from '@/lib/services/financeiro/FinanceiroService'
import { ok, serverError } from '@/lib/api/responses'

type Params = { params: { tenant: string } }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const { searchParams } = new URL(req.url)
      const ano = Number(searchParams.get('ano') ?? new Date().getFullYear())

      const [categorias, valores] = await Promise.all([
        db.select().from(dbGastoFixoCategoria).where(eq(dbGastoFixoCategoria.activeFlag, true)).orderBy(dbGastoFixoCategoria.ordem),
        db.select().from(dbGastoFixoValor).where(and(eq(dbGastoFixoValor.ano, ano), eq(dbGastoFixoValor.activeFlag, true))),
      ])

      // Monta grade: { categoriaId: { mes: valor } }
      const grade: Record<number, Record<number, number>> = {}
      for (const cat of categorias) {
        grade[cat.categoriaId] = {}
      }
      for (const val of valores) {
        if (!grade[val.categoriaId]) grade[val.categoriaId] = {}
        grade[val.categoriaId][val.mes] = val.valor
      }

      return ok({ categorias, grade, ano })
    } finally { release() }
  } catch (err) { return serverError(err) }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const body = await req.json()

      // Ação especial: copiar do mês anterior
      if (body.acao === 'copiarMesAnterior') {
        const { mes, ano } = body
        const copiados = await new FinanceiroService(db).copiarGastosFixosMesAnterior(mes, ano)
        return ok({ copiados })
      }

      // Ação especial: propagar valor de Jan para todos os meses da linha
      if (body.acao === 'propagarAnual') {
        const { categoriaId, ano, valor } = body
        for (let mes = 1; mes <= 12; mes++) {
          await db.execute(sql`
            INSERT INTO t_gasto_fixo_valor (categoria_id, ano, mes, valor, created_dt, updated_dt, created_by, updated_by, active_flg, modification_num)
            VALUES (${categoriaId}, ${ano}, ${mes}, ${valor}, NOW(), NOW(), 1, 1, true, 0)
            ON CONFLICT (categoria_id, ano, mes)
            DO UPDATE SET valor = ${valor}, updated_dt = NOW()
          `)
        }
        return ok({ propagado: true })
      }

      // Salvar/atualizar célula individual
      const { categoriaId, ano, mes, valor } = body
      await db.execute(sql`
        INSERT INTO t_gasto_fixo_valor (categoria_id, ano, mes, valor, created_dt, updated_dt, created_by, updated_by, active_flg, modification_num)
        VALUES (${categoriaId}, ${ano}, ${mes}, ${valor}, NOW(), NOW(), 1, 1, true, 0)
        ON CONFLICT (categoria_id, ano, mes)
        DO UPDATE SET valor = ${valor}, updated_dt = NOW()
      `)
      return ok({ ok: true })
    } finally { release() }
  } catch (err) { return serverError(err) }
}