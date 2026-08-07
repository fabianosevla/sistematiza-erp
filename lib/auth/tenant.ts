import { currentUser, clerkClient } from '@clerk/nextjs/server'
import { getPublicDb, pool } from '@/lib/db/connection'
import { dbTenant } from '@/lib/db/schemas/public'
import { eq } from 'drizzle-orm'

/**
 * Valida que o usuário autenticado tem acesso ao tenant solicitado.
 * Verifica também que o usuário existe e está ativo no banco do tenant.
 * Sincroniza clerkId quando o usuário aceita o convite.
 *
 * ─── POR QUE O METADATA DEIXOU DE SER A ÚNICA PORTA ────────────────────────
 *
 * Antes, a primeira linha de defesa era `publicMetadata.tenantSlug`, gravado
 * pelo Clerk no momento em que a pessoa aceita o convite. Se ele não estivesse
 * lá, a função lançava FORBIDDEN antes de tocar no banco.
 *
 * Em produção isso quebrou: o Clerk NÃO transferiu o publicMetadata do convite
 * para a conta criada via Google. O usuário entrava, o app abria, e todas as
 * rotas devolviam erro — com as telas mostrando "nenhum registro" em vez de
 * "sem permissão", o que despistava o diagnóstico.
 *
 * Pior: o trecho que conserta o clerk_id fica DEPOIS dessa validação. Então o
 * vínculo nunca se refazia sozinho, e cada usuário novo exigia edição manual
 * do metadata no painel do Clerk. Não escala nem para um cliente.
 *
 * A autorização agora tem duas fontes, nesta ordem:
 *
 *   1. metadata presente  → tem que bater com o tenant pedido, senão FORBIDDEN.
 *      (é o que impede o usuário do tenant A de espiar o tenant B)
 *
 *   2. metadata ausente   → decide pelo t_usuario do schema pedido: se existe
 *      uma linha ativa com aquele e-mail ou clerk_id, o acesso vale e o
 *      metadata é gravado ali mesmo, para as próximas requisições caírem no
 *      caminho 1.
 *
 * O t_usuario é fonte legítima de autorização — é a tabela que a tela de
 * Usuários administra. E, com o cadastro em modo restrito no Clerk, ninguém
 * cria conta com um e-mail que não tenha sido convidado antes.
 */
export async function resolveTenant(tenantSlug: string) {
  const user = await currentUser()
  if (!user) throw new Error('UNAUTHORIZED')

  const userTenantSlug = user.publicMetadata?.tenantSlug as string | undefined

  // Metadata preenchido e apontando para outro tenant: barra na hora, sem
  // consultar banco nenhum. Este é o caso que realmente precisa ser negado.
  if (userTenantSlug && userTenantSlug !== tenantSlug) {
    throw new Error('FORBIDDEN')
  }

  // Ausente não é mais motivo de recusa — é motivo de verificar no banco.
  const faltaMetadata = !userTenantSlug

  const { db, release } = await getPublicDb()
  let tenant: any
  try {
    const [t] = await db
      .select()
      .from(dbTenant)
      .where(eq(dbTenant.slug, tenantSlug))
    if (!t || !t.activeFlag) throw new Error('TENANT_NOT_FOUND')
    tenant = t
  } finally {
    release()
  }

  // Verifica e sincroniza o usuário no banco do tenant
  const client = await pool.connect()
  try {
    await client.query(`SET search_path TO "${tenant.schemaName}", public`)

    // 1. Tenta encontrar pelo clerkId real
    let result = await client.query(
      `SELECT usuario_id, nome, active_flg, clerk_id, email
       FROM t_usuario WHERE clerk_id = $1 AND active_flg = true LIMIT 1`,
      [user.id]
    )

    // 2. Se não encontrou, tenta pelo e-mail (convite pendente que aceitou)
    if (result.rows.length === 0) {
      const userEmail = user.emailAddresses?.[0]?.emailAddress
      if (userEmail) {
        result = await client.query(
          `SELECT usuario_id, nome, active_flg, clerk_id, email
           FROM t_usuario
           WHERE LOWER(email) = LOWER($1) AND active_flg = true LIMIT 1`,
          [userEmail]
        )

        if (result.rows.length > 0) {
          const usuarioPendente = result.rows[0]
          // Sincroniza o clerkId real (usuário aceitou o convite)
          await client.query(
            `UPDATE t_usuario SET clerk_id = $1, updated_dt = NOW()
             WHERE usuario_id = $2`,
            [user.id, usuarioPendente.usuario_id]
          )
        }
      }
    }

    // 3. Se não encontrou por nenhum método — usuário não tem acesso
    if (result.rows.length === 0) {
      throw new Error('USER_NOT_IN_TENANT')
    }

  } finally {
    client.release()
  }

  // Chegou aqui sem metadata: o banco autorizou. Grava o vínculo no Clerk para
  // que a próxima requisição resolva pelo caminho barato, sem ir ao t_usuario.
  //
  // Falha aqui não derruba o acesso: quem autorizou foi o banco, e o Clerk é
  // só cache. Se a escrita não passar, a requisição seguinte tenta de novo.
  if (faltaMetadata) {
    try {
      await clerkClient().users.updateUserMetadata(user.id, {
        publicMetadata: {
          ...(user.publicMetadata ?? {}),
          tenantSlug,
        },
      })
    } catch (err) {
      console.warn('[resolveTenant] nao foi possivel gravar tenantSlug no Clerk:', err)
    }
  }

  return tenant
}
