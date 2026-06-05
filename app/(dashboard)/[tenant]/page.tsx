import { auth, currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'

interface Props {
  params: { tenant: string }
}

export default async function DashboardHome({ params }: Props) {
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
          <div className="mb-6">
            <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
            <p className="text-sm text-gray-500 mt-1">Bem-vindo ao sistematiza.erp</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { label: 'Vendas hoje', value: 'R$ 0,00', sub: '0 transações' },
              { label: 'Produtos em estoque', value: '0', sub: '0 abaixo do mínimo' },
              { label: 'Clientes cadastrados', value: '0', sub: 'Total ativo' },
            ].map(card => (
              <div key={card.label} className="bg-white rounded-xl border border-gray-100 p-5">
                <p className="text-sm text-gray-500">{card.label}</p>
                <p className="text-2xl font-semibold text-gray-900 mt-1">{card.value}</p>
                <p className="text-xs text-gray-400 mt-1">{card.sub}</p>
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  )
}
