import { auth, currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'
import FornecedoresView from '@/components/modules/cadastros/FornecedoresView'

interface Props { params: { tenant: string } }

export default async function FornecedoresPage({ params }: Props) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')
  const user = await currentUser()
  const tenantSlug = user?.publicMetadata?.tenantSlug as string | undefined
  if (!tenantSlug || tenantSlug !== params.tenant) redirect('/onboarding')
  const tenantName = (user?.publicMetadata?.tenantName as string) ?? params.tenant

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar tenantSlug={params.tenant} tenantName={tenantName} />
      <div className="flex-1 flex flex-col">
        <Header tenantName={tenantName} />
        <main className="flex-1 p-6">
          <FornecedoresView tenantSlug={params.tenant} />
        </main>
      </div>
    </div>
  )
}