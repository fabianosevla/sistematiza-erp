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
        // TODOS os lançamentos, de todo ano — não só o ano pedido. Gasto
        // fixo é fixo: um valor lançado em dezembro do ano anterior precisa
        // continuar valendo em janeiro deste, sem ninguém copiar nada.
        client.query(`SELECT categoria_id, ano, mes, valor FROM t_gasto_fixo_valor WHERE active_flg = true ORDER BY ano, mes`),
      ])

      const categorias = catsRes.rows.map(r => ({
        categoriaId: r.categoria_id,
        nome:        r.nome,
        ordem:       r.ordem,
      }))

      // Linha do tempo de cada categoria, em ordem cronológica — é o que
      // permite achar "o último valor lançado até este mês", de qualquer
      // ano anterior.
      const linhas: Record<number, { ordem: number; valor: number }[]> = {}
      for (const v of valsRes.rows) {
        const cid = v.categoria_id
        if (!linhas[cid]) linhas[cid] = []
        linhas[cid].push({ ordem: Number(v.ano) * 12 + Number(v.mes), valor: Number(v.valor) })
      }

      // grade[categoriaId][mes] = valor explícito daquele mês, OU herdado do
      // lançamento explícito mais recente até ali. Nunca olha pra frente —
      // só editar o mês atual em diante, o passado não recalcula sozinho.
      const grade: Record<number, Record<number, number>> = {}
      for (const cat of categorias) {
        grade[cat.categoriaId] = {}
        const linha = linhas[cat.categoriaId] ?? []
        let valorAtual = 0
        let i = 0
        for (let mes = 1; mes <= 12; mes++) {
          const alvo = ano * 12 + mes
          while (i < linha.length && linha[i].ordem <= alvo) { valorAtual = linha[i].valor; i++ }
          grade[cat.categoriaId][mes] = valorAtual
        }
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

      // Salvar célula individual. Gasto fixo repete pra frente sozinho (ver
      // GET acima) — não existe mais "copiar mês anterior" nem "propagar":
      // gravar um mês aqui já vale para os seguintes que não tiverem valor
      // próprio, sem precisar copiar nada à mão.
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