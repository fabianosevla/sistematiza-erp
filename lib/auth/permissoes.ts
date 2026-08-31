// lib/auth/permissoes.ts
//
// Checagem de autorização no servidor, por trás de resolveTenant. O frontend
// já esconde menu/ações conforme o perfil (is_admin, acesso_gerencial,
// modulo_*), mas isso é só apresentação — sem checagem aqui, qualquer
// requisição autenticada do tenant conseguia chamar a rota direto.
import { idLogado } from '@/lib/auth/identidade'
import { pool } from '@/lib/db/connection'

export type Modulo =
  | 'dashboard' | 'cadastros' | 'vendas' | 'financeiro' | 'estoque'
  | 'producao'  | 'pedidos'   | 'comandas' | 'consultas' | 'fiscal'
  | 'planoAcao' | 'metas'     | 'fidelidade' | 'usuarios' | 'compras'

const COLUNA_MODULO: Record<Modulo, string> = {
  dashboard:  'modulo_dashboard',
  cadastros:  'modulo_cadastros',
  vendas:     'modulo_vendas',
  financeiro: 'modulo_financeiro',
  estoque:    'modulo_estoque',
  producao:   'modulo_producao',
  pedidos:    'modulo_pedidos',
  comandas:   'modulo_comandas',
  consultas:  'modulo_consultas',
  fiscal:     'modulo_fiscal',
  planoAcao:  'modulo_plano_acao',
  metas:      'modulo_metas',
  fidelidade: 'modulo_fidelidade',
  usuarios:   'modulo_usuarios',
  compras:    'modulo_compras',
}

type LinhaAcesso = {
  perfil: string | null
  is_admin: boolean | null
  acesso_gerencial: boolean | null
  [coluna: string]: unknown
}

async function carregarAcesso(schemaName: string): Promise<LinhaAcesso | null> {
  const clerkId = await idLogado()
  if (!clerkId) throw new Error('UNAUTHORIZED')

  const client = await pool.connect()
  try {
    await client.query(`SET search_path TO "${schemaName}", public`)
    const result = await client.query(
      `SELECT u.perfil, p.is_admin, p.acesso_gerencial,
              p.modulo_dashboard, p.modulo_cadastros, p.modulo_vendas, p.modulo_financeiro,
              p.modulo_estoque, p.modulo_producao, p.modulo_pedidos, p.modulo_comandas,
              p.modulo_consultas, p.modulo_fiscal, p.modulo_plano_acao, p.modulo_metas,
              p.modulo_fidelidade, p.modulo_usuarios, p.modulo_compras
         FROM t_usuario u
         LEFT JOIN t_perfil_acesso p ON p.perfil_id = u.perfil_id AND p.active_flg = true
        WHERE u.clerk_id = $1 AND u.active_flg = true
        LIMIT 1`,
      [clerkId]
    )
    return (result.rows[0] as LinhaAcesso) ?? null
  } finally {
    client.release()
  }
}

function ehAdmin(row: LinhaAcesso): boolean {
  // is_admin vem do perfil vinculado; perfil === 'admin' cobre o usuário
  // legado sem perfil_id (mesma regra que PerfisService.getAcessosUsuario).
  return row.is_admin === true || row.perfil === 'admin'
}

/** Lança FORBIDDEN se o usuário logado não for admin (is_admin ou perfil legado 'admin'). */
export async function exigirAdmin(schemaName: string): Promise<void> {
  const row = await carregarAcesso(schemaName)
  if (!row || !ehAdmin(row)) throw new Error('FORBIDDEN')
}

// Módulo desligado pelo tenant (Configurações > Habilitações) bloqueia todo
// mundo, inclusive admin — é "este recurso não existe pra este cliente", não
// uma questão de permissão de usuário. Hoje só fidelidade tem essa trava
// reforçada aqui; os demais módulos ainda só escondem o menu (config.*Ativo),
// sem bloquear a API se alguém acessar a rota direto.
async function moduloDesligadoNoTenant(schemaName: string, modulo: Modulo): Promise<boolean> {
  if (modulo !== 'fidelidade') return false
  const client = await pool.connect()
  try {
    await client.query(`SET search_path TO "${schemaName}", public`)
    const r = await client.query(`SELECT fidelidade_ativo FROM t_configuracoes_tenant LIMIT 1`)
    return r.rows[0]?.fidelidade_ativo === false
  } finally {
    client.release()
  }
}

/** Lança FORBIDDEN se o usuário logado não tiver acesso gerencial + o módulo liberado no perfil. */
export async function exigirModulo(schemaName: string, modulo: Modulo): Promise<void> {
  if (await moduloDesligadoNoTenant(schemaName, modulo)) throw new Error('FORBIDDEN')
  const row = await carregarAcesso(schemaName)
  if (!row) throw new Error('FORBIDDEN')
  if (ehAdmin(row)) return
  if (row.acesso_gerencial === true && row[COLUNA_MODULO[modulo]] === true) return
  throw new Error('FORBIDDEN')
}

/** Versão que não lança: útil para decidir o que devolver (ex.: mascarar campo sensível). */
export async function souAdmin(schemaName: string): Promise<boolean> {
  try {
    const row = await carregarAcesso(schemaName)
    return !!row && ehAdmin(row)
  } catch {
    return false
  }
}
