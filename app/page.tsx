import { auth, currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'

export default async function Home() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const user = await currentUser()
  const tenantSlug = user?.publicMetadata?.tenantSlug as string | undefined

  if (!tenantSlug) redirect('/onboarding')

  redirect(`/${tenantSlug}/selecionar-modulo`)
}