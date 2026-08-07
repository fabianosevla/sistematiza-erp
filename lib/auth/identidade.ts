// ESTE ARQUIVO VAI EM: lib/auth/identidade.ts
//
// CAMADA DE IDENTIDADE — O ÚNICO LUGAR DO SERVIDOR QUE CONHECE O CLERK.
//
// Antes, `currentUser()`, `auth()` e `clerkClient()` eram chamados direto de
// dentro do resolveTenant, do usuarioAtual, das rotas de usuário e do
// onboarding. Trocar de provedor de autenticação um dia significaria caçar
// essas chamadas espalhadas e reescrever cada uma no contexto dela.
//
// Aqui elas ficam atrás de funções que falam a língua do sistema — usuário
// logado, convidar, lembrar empresa — e não a língua do fornecedor. Migrar
// passa a ser reescrever este arquivo.
//
// ─── O QUE ESTA CAMADA NÃO RESOLVE ──────────────────────────────────────────
//
// A interface do login — <SignIn/>, <UserButton/>, ClerkProvider, useUser —
// continua acoplada, e de propósito. É componente visual do fornecedor: numa
// troca, essa parte seria redesenhada de qualquer jeito, então escondê-la atrás
// de abstração seria trabalho para jogar fora.
//
// O que precisa estar isolado é a REGRA: quem é o usuário, como se convida
// alguém, como se guarda a última empresa. Isso está aqui.
//
// ─── PARA QUEM VIER TROCAR O PROVEDOR ───────────────────────────────────────
//
// Reimplemente as funções abaixo mantendo a assinatura. O resto do servidor não
// precisa saber que algo mudou. Os pontos que exigem atenção:
//
//   • `id` é a chave que vai para t_usuario.clerk_id. Se o provedor novo usar
//     outro formato, o campo continua servindo — é varchar(200) e guarda um
//     identificador opaco, não um formato específico.
//   • `convidar` precisa entregar e-mail. Hoje o Clerk manda por
//     clkmail.sistematizaoficial.com, com DKIM próprio. Um provedor sem envio
//     obrigaria a contratar entrega de e-mail à parte.
//   • `gerarLinkDeAcesso` é usado no reset de senha do painel de Usuários.
import { auth, currentUser, clerkClient } from '@clerk/nextjs/server'

export interface UsuarioLogado {
  /** Identificador opaco do provedor. É o que vai em t_usuario.clerk_id. */
  id:    string
  email: string | null
  nome:  string | null
  /** Última empresa acessada. Memória de conveniência, nunca autorização. */
  empresaLembrada: string | null
}

/** Id de quem está na requisição, sem ir buscar o perfil completo. */
export async function idLogado(): Promise<string | null> {
  const { userId } = await auth()
  return userId ?? null
}

/**
 * Usuário da requisição, ou null.
 *
 * O e-mail sai do endereço primário quando há mais de um. Usar o primeiro da
 * lista daria resultado diferente conforme a ordem que o provedor devolvesse —
 * e o e-mail é o que casa a pessoa com o cadastro em t_usuario.
 */
export async function usuarioLogado(): Promise<UsuarioLogado | null> {
  const u = await currentUser()
  if (!u) return null

  const enderecos = u.emailAddresses ?? []
  const primario  = enderecos.find(e => e.id === u.primaryEmailAddressId) ?? enderecos[0]

  const nome = [u.firstName, u.lastName].filter(Boolean).join(' ').trim()

  return {
    id:    u.id,
    email: primario?.emailAddress?.trim()?.toLowerCase() ?? null,
    nome:  nome || null,
    empresaLembrada: (u.publicMetadata?.tenantSlug as string | undefined) ?? null,
  }
}

/**
 * Guarda qual foi a última empresa acessada.
 *
 * É conveniência, não autorização: quem decide o acesso é o t_usuario do
 * schema. Falhar aqui não pode derrubar requisição, por isso quem chama trata
 * como best-effort.
 */
export async function lembrarEmpresa(usuarioId: string, slug: string): Promise<void> {
  const atual = await currentUser()
  await clerkClient().users.updateUserMetadata(usuarioId, {
    publicMetadata: { ...(atual?.publicMetadata ?? {}), tenantSlug: slug },
  })
}

/** Convida alguém por e-mail. `dados` vai junto e volta no perfil quando aceito. */
export async function convidar({ email, redirectUrl, dados }: {
  email:        string
  redirectUrl:  string
  dados?:       Record<string, unknown>
}): Promise<void> {
  await clerkClient().invitations.createInvitation({
    emailAddress:   email.trim(),
    redirectUrl,
    publicMetadata: dados ?? {},
    // Permite reenviar para quem já foi convidado antes.
    ignoreExisting: true,
  })
}

/** Atualiza o nome exibido. O sistema é dono do nome; o provedor só reflete. */
export async function atualizarNome(usuarioId: string, nome: string): Promise<void> {
  const partes = nome.trim().split(' ')
  await clerkClient().users.updateUser(usuarioId, {
    firstName: partes[0],
    lastName:  partes.slice(1).join(' ') || undefined,
  })
}

/** Remove a conta no provedor. O registro local é excluído por quem chama. */
export async function removerConta(usuarioId: string): Promise<void> {
  await clerkClient().users.deleteUser(usuarioId)
}

/**
 * Link de acesso direto, válido por um tempo. O admin copia e envia para quem
 * perdeu a senha.
 */
export async function gerarLinkDeAcesso(
  usuarioId: string,
  segundos = 60 * 60 * 24,
): Promise<string> {
  const token = await clerkClient().signInTokens.createSignInToken({
    userId:           usuarioId,
    expiresInSeconds: segundos,
  })
  return token.url
}

/** Identificador provisório de quem foi convidado e ainda não aceitou. */
export function idProvisorio(email: string): string {
  return `pending_${email.trim().replace(/[^a-z0-9]/gi, '_')}`
}

/** Reconhece o identificador provisório acima. */
export function ehProvisorio(id: string | null | undefined): boolean {
  return !!id && id.startsWith('pending_')
}
