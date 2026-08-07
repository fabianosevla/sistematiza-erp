import { auth, currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { tenantSlugPorEmail } from '@/lib/auth/tenant'

export default async function Home() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const user = await currentUser()
  let tenantSlug = user?.publicMetadata?.tenantSlug as string | undefined

  // O Clerk nem sempre transfere o publicMetadata do convite para a conta
  // criada (acontece com login por Google). Sem o passo abaixo, um usuário
  // legítimo que entre pelo domínio puro — em vez de clicar no link do e-mail
  // — cairia em "Criar minha empresa" e poderia criar um tenant duplicado.
  //
  // O metadata volta a ser gravado logo em seguida, pelo resolveTenant, quando
  // a navegação chegar numa rota com o tenant na URL.
  if (!tenantSlug) {
    const email = user?.emailAddresses?.[0]?.emailAddress
    if (email) {
      tenantSlug = (await tenantSlugPorEmail(email)) ?? undefined
    }
  }

  if (!tenantSlug) redirect('/onboarding')

  redirect(`/${tenantSlug}/selecionar-modulo`)
}
