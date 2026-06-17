import TenantLayout from '@/app/(dashboard)/tenant-layout'
import PerfisView from '@/components/modules/perfis/PerfisView'

interface Props { params: { tenant: string } }

export default async function PerfisPage({ params }: Props) {
  return (
    <TenantLayout tenantSlug={params.tenant}>
      <PerfisView tenantSlug={params.tenant} />
    </TenantLayout>
  )
}