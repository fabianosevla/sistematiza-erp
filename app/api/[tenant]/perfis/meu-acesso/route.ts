// @ts-nocheck
import type { NextRequest } from 'next/server'
import { idLogado } from '@/lib/auth/identidade'
import { resolveTenant } from '@/lib/auth/tenant'
import { pool } from '@/lib/db/connection'
import { ok, serverError } from '@/lib/api/responses'

type Params = { params: { tenant: string } }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const userId = await idLogado()
    if (!userId) throw new Error('UNAUTHORIZED')

    const tenant = await resolveTenant(params.tenant)

    const client = await pool.connect()
    try {
      await client.query(`SET search_path TO "${tenant.schemaName}", public`)

      const result = await client.query(
        `SELECT u.usuario_id, u.nome, u.email, u.perfil, u.perfil_id,
                p.is_admin, p.acesso_gerencial, p.acesso_pdv, p.acesso_comanda, p.acesso_delivery,
                p.modulo_dashboard, p.modulo_cadastros, p.modulo_vendas, p.modulo_financeiro,
                p.modulo_estoque, p.modulo_producao, p.modulo_pedidos, p.modulo_comandas,
                p.modulo_consultas, p.modulo_fiscal, p.modulo_plano_acao, p.modulo_metas, p.modulo_usuarios,
                p.perc_desconto_max, p.valor_desconto_max
         FROM t_usuario u
         LEFT JOIN t_perfil_acesso p ON p.perfil_id = u.perfil_id AND p.active_flg = true
         WHERE u.clerk_id = $1 AND u.active_flg = true
         LIMIT 1`,
        [userId]
      )

      if (result.rows.length === 0) {
        return ok({ nome: '', email: '', perfil: 'user', modulos: {} })
      }

      const row = result.rows[0]
      const isAdmin = row.is_admin ?? (row.perfil === 'admin')

      return ok({
        usuarioId:       row.usuario_id,
        nome:            row.nome,
        email:           row.email,
        perfil:          row.perfil,
        perfilId:        row.perfil_id,
        isAdmin,
        acessoGerencial: isAdmin || row.acesso_gerencial,
        acessoPdv:       isAdmin || row.acesso_pdv,
        acessoComanda:   isAdmin || row.acesso_comanda,
        acessoDelivery:  isAdmin || row.acesso_delivery,
        modulos: {
          dashboard:  isAdmin || row.modulo_dashboard,
          cadastros:  isAdmin || row.modulo_cadastros,
          vendas:     isAdmin || row.modulo_vendas,
          financeiro: isAdmin || row.modulo_financeiro,
          estoque:    isAdmin || row.modulo_estoque,
          producao:   isAdmin || row.modulo_producao,
          pedidos:    isAdmin || row.modulo_pedidos,
          comandas:   isAdmin || row.modulo_comandas,
          consultas:  isAdmin || row.modulo_consultas,
          fiscal:     isAdmin || row.modulo_fiscal,
          planoAcao:  isAdmin || row.modulo_plano_acao,
          metas:      isAdmin || row.modulo_metas,
          usuarios:   isAdmin || row.modulo_usuarios,
        },
        percDescontoMax:  row.perc_desconto_max ?? '100',
        valorDescontoMax: row.valor_desconto_max ?? 0,
      })
    } finally {
      client.release()
    }
  } catch (err) {
    return serverError(err)
  }
}