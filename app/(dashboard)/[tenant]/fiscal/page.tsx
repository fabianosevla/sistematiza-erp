import TenantLayout from '@/app/(dashboard)/tenant-layout'
import FiscalView   from '@/components/modules/fiscal/FiscalView'

interface Props { params: { tenant: string } }

export default async function FiscalPage({ params }: Props) {
  return (
    <TenantLayout tenantSlug={params.tenant}>
      <FiscalView tenantSlug={params.tenant} />
    </TenantLayout>
  )
}