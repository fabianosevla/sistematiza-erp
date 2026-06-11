import { currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'

export default async function RootPage() {
  const user = await currentUser()
  if (!user) redirect('/sign-in')

  const tenantSlug = user.publicMetadata?.tenantSlug as string | undefined
  if (tenantSlug) redirect(`/${tenantSlug}`)

  redirect('/onboarding')
}