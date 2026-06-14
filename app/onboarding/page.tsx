import { currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import OnboardingForm from './OnboardingForm'

export default async function OnboardingPage() {
  const user = await currentUser()
  if (!user) redirect('/sign-in')

  const tenantSlug = user.publicMetadata?.tenantSlug as string | undefined
  if (tenantSlug) redirect(`/${tenantSlug}`)

  return <OnboardingForm />
}
