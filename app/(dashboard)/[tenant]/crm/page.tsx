import TenantLayout from '@/app/(dashboard)/tenant-layout'
import CrmView      from '@/components/modules/crm/CrmView'

interface Props { params: { tenant: string } }

export default async function CrmPage({ params }: Props) {
  return (
    <TenantLayout tenantSlug={params.tenant}>
      <CrmView tenantSlug={params.tenant} />
    </TenantLayout>
  )
}
