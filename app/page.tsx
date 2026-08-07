import { redirect } from 'next/navigation'
import { usuarioLogado } from '@/lib/auth/identidade'
import { tenantsDoUsuarioPorEmail } from '@/lib/auth/tenant'

export default async function Home() {
  const user = await usuarioLogado()
  if (!user) redirect('/sign-in')

  const email = user.email

  // Quem manda é o cadastro, não o metadata do Clerk. A mesma pessoa pode
  // pertencer a mais de uma empresa — o suporte precisa disso, e um contador
  // que atende dois clientes também.
  const empresas = email ? await tenantsDoUsuarioPorEmail(email) : []

  // Nenhuma: é cliente novo, vai criar a própria empresa.
  if (empresas.length === 0) redirect('/onboarding')

  // Uma só: entra direto. É o caso de praticamente todo usuário, e mostrar uma
  // tela de escolha com um botão seria cerimônia sem função.
  if (empresas.length === 1) redirect(`/${empresas[0].slug}/selecionar-modulo`)

  // Mais de uma: escolhe.
  redirect('/selecionar-empresa')
}
