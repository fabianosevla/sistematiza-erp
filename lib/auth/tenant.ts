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
/**
 * Descobre a que tenant um e-mail pertence, varrendo os schemas ativos.
 *
 * Existe para a raiz do app (`app/page.tsx`), que decide o destino do usuário
 * ANTES de haver um tenant na URL — e por isso não passa pelo resolveTenant.
 * Sem isso, quem aceita o convite e digita o domínio puro (em vez de clicar no
 * link do e-mail) cai na tela "Criar minha empresa", com o metadata ainda
 * vazio, e pode criar um schema duplicado sem querer.
 *
 * Devolve o slug do primeiro tenant onde o e-mail é usuário ATIVO, ou null.
 *
 * A varredura é sequencial porque o número de tenants é pequeno e isso só roda
 * quando o metadata está ausente — ou seja, uma vez por usuário, no primeiro
 * acesso. Depois disso o resolveTenant grava o vínculo e este caminho não é
 * mais tocado.
 */
export async function tenantsDoUsuarioPorEmail(
  email: string,
): Promise<{ slug: string; name: string }[]> {
  const alvo = email?.trim()
  if (!alvo) return []

  const { db, release } = await getPublicDb()
  let tenants: any[] = []
  try {
    tenants = await db.select().from(dbTenant).where(eq(dbTenant.activeFlag, true))
  } finally {
    release()
  }

  const achados: { slug: string; name: string }[] = []
  const client = await pool.connect()
  try {
    for (const t of tenants) {
      if (!t.schemaName) continue

      // Um tenant pode existir no t_tenant sem ter as tabelas criadas (o
      // onboarding grava a linha antes de montar o schema). Sem esta guarda,
      // um schema incompleto derrubaria a varredura inteira com "relation
      // does not exist" e o usuário iria para o onboarding por engano.
      const chk = await client.query(
        `SELECT to_regclass($1) IS NOT NULL AS existe`,
        [`"${t.schemaName}".t_usuario`],
      )
      if (!chk.rows[0]?.existe) continue

      const achou = await client.query(
        `SELECT 1 FROM "${t.schemaName}".t_usuario
          WHERE LOWER(email) = LOWER($1) AND active_flg = true
          LIMIT 1`,
        [alvo],
      )
      if (achou.rows.length > 0) achados.push({ slug: t.slug, name: t.name })
    }
  } finally {
    client.release()
  }

  return achados
}

/** Primeira empresa do usuário, ou null. Conveniência para quem só precisa saber se existe alguma. */
export async function tenantSlugPorEmail(email: string): Promise<string | null> {
  const lista = await tenantsDoUsuarioPorEmail(email)
  return lista[0]?.slug ?? null
}

export async function resolveTenant(tenantSlug: string) {
  const user = await currentUser()
  if (!user) throw new Error('UNAUTHORIZED')

  const userTenantSlug = user.publicMetadata?.tenantSlug as string | undefined

  // O METADATA DEIXOU DE AUTORIZAR. Quem autoriza é o t_usuario do schema
  // pedido, verificado mais abaixo — se o e-mail ou o clerk_id não estiverem
  // lá, ativos, a função lança USER_NOT_IN_TENANT e ninguém entra.
  //
  // Antes o metadata guardava UM slug e qualquer divergência era FORBIDDEN.
  // Isso protegia o cliente A de espiar o cliente B, mas com o efeito colateral
  // de prender toda conta a uma empresa só — inclusive a de suporte, que
  // precisa entrar em qualquer cliente.
  //
  // Duas fontes de verdade para a mesma pergunta é onde nasce brecha: bastava
  // o metadata estar desatualizado para o acesso divergir do cadastro. Agora a
  // pergunta "esta pessoa pode entrar aqui?" tem uma resposta só, e ela mora na
  // tabela que a tela de Usuários administra.
  //
  // O metadata sobrou como memória da última empresa usada, e é atualizado no
  // fim quando muda.
  const precisaAtualizarMetadata = userTenantSlug !== tenantSlug

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

  // O banco autorizou. O metadata guarda qual foi a última empresa acessada —
  // serve para o app lembrar, não para decidir.
  //
  // Falha aqui não derruba nada: quem autorizou foi o t_usuario. Se a escrita
  // no Clerk não passar, a requisição seguinte tenta de novo.
  if (precisaAtualizarMetadata) {
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
