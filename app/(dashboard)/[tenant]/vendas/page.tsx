import TenantLayout from '@/app/(dashboard)/tenant-layout'
import VendasView from '@/components/modules/vendas/VendasView'

interface Props { params: { tenant: string } }

export default async function VendasPage({ params }: Props) {
  return (
    <TenantLayout tenantSlug={params.tenant}>
      <VendasView tenantSlug={params.tenant} />
    </TenantLayout>
  )
}