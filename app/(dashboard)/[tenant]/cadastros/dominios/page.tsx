import TenantLayout from '@/app/(dashboard)/tenant-layout'
import DominiosView from '@/components/modules/cadastros/DominiosView'

interface Props { params: { tenant: string } }

export default async function DominiosPage({ params }: Props) {
  return (
    <TenantLayout tenantSlug={params.tenant}>
      <DominiosView tenantSlug={params.tenant} />
    </TenantLayout>
  )
}