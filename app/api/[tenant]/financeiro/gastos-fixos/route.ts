// @ts-nocheck
import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { pool } from '@/lib/db/connection'
import { ok, serverError } from '@/lib/api/responses'

type Params = { params: { tenant: string } }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { searchParams } = new URL(req.url)
    const ano = Number(searchParams.get('ano') ?? new Date().getFullYear())

    const client = await pool.connect()
    try {
      await client.query(`SET search_path TO "${tenant.schemaName}", public`)

      const [catsRes, valsRes] = await Promise.all([
        client.query(`SELECT * FROM t_gasto_fixo_categoria WHERE active_flg = true ORDER BY ordem`),
        client.query(`SELECT * FROM t_gasto_fixo_valor WHERE ano = $1 AND active_flg = true`, [ano]),
      ])

      const categorias = catsRes.rows.map(r => ({
        categoriaId: r.categoria_id,
        nome:        r.nome,
        ordem:       r.ordem,
      }))

      // grade[categoriaId][mes] = valor
      const grade: Record<number, Record<number, number>> = {}
      for (const cat of categorias) grade[cat.categoriaId] = {}
      for (const val of valsRes.rows) {
        if (!grade[val.categoria_id]) grade[val.categoria_id] = {}
        grade[val.categoria_id][val.mes] = Number(val.valor)
      }

      return ok({ categorias, grade, ano })
    } finally {
      client.release()
    }
  } catch (err) {
    return serverError(err)
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const body   = await req.json()
    const client = await pool.connect()
    try {
      await client.query(`SET search_path TO "${tenant.schemaName}", public`)

      // Copiar do mês anterior
      if (body.acao === 'copiarMesAnterior') {
        const { mes, ano } = body
        const mesPrev = mes === 1 ? 12 : mes - 1
        const anoPrev = mes === 1 ? ano - 1 : ano
        const prev = await client.query(
          `SELECT categoria_id, valor FROM t_gasto_fixo_valor WHERE ano = $1 AND mes = $2 AND active_flg = true AND valor > 0`,
          [anoPrev, mesPrev]
        )
        let copiados = 0
        for (const row of prev.rows) {
          await client.query(`
            INSERT INTO t_gasto_fixo_valor (categoria_id, ano, mes, valor, created_dt, updated_dt, created_by, updated_by, active_flg, modification_num)
            VALUES ($1, $2, $3, $4, NOW(), NOW(), 1, 1, true, 0)
            ON CONFLICT (categoria_id, ano, mes) DO UPDATE SET valor = $4, updated_dt = NOW()
          `, [row.categoria_id, ano, mes, row.valor])
          copiados++
        }
        return ok({ copiados })
      }

      // Propagar valor de janeiro para todos os meses da linha
      if (body.acao === 'propagarAnual') {
        const { categoriaId, ano, valor } = body
        for (let mes = 1; mes <= 12; mes++) {
          await client.query(`
            INSERT INTO t_gasto_fixo_valor (categoria_id, ano, mes, valor, created_dt, updated_dt, created_by, updated_by, active_flg, modification_num)
            VALUES ($1, $2, $3, $4, NOW(), NOW(), 1, 1, true, 0)
            ON CONFLICT (categoria_id, ano, mes) DO UPDATE SET valor = $4, updated_dt = NOW()
          `, [categoriaId, ano, mes, valor])
        }
        return ok({ propagado: true })
      }

      // Salvar célula individual
      const { categoriaId, ano, mes, valor } = body
      await client.query(`
        INSERT INTO t_gasto_fixo_valor (categoria_id, ano, mes, valor, created_dt, updated_dt, created_by, updated_by, active_flg, modification_num)
        VALUES ($1, $2, $3, $4, NOW(), NOW(), 1, 1, true, 0)
        ON CONFLICT (categoria_id, ano, mes) DO UPDATE SET valor = $4, updated_dt = NOW()
      `, [categoriaId, ano, mes, valor])
      return ok({ ok: true })
    } finally {
      client.release()
    }
  } catch (err) {
    return serverError(err)
  }
}