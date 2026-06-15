import TenantLayout from '@/app/(dashboard)/tenant-layout'
import DashboardHome from '@/components/modules/dashboard/DashboardHome'

interface Props { params: { tenant: string } }

export default async function DashboardPage({ params }: Props) {
  return (
    <TenantLayout tenantSlug={params.tenant}>
      <DashboardHome tenantSlug={params.tenant} />
    </TenantLayout>
  )
}