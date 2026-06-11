import TenantLayout  from '@/app/(dashboard)/tenant-layout'
import DashboardView from '@/components/modules/dashboard/DashboardView'

interface Props { params: { tenant: string } }

export default async function TenantDashboardPage({ params }: Props) {
  return (
    <TenantLayout tenantSlug={params.tenant}>
      <DashboardView tenantSlug={params.tenant} />
    </TenantLayout>
  )
}