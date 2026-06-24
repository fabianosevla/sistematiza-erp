import TenantLayout from '@/app/(dashboard)/tenant-layout'
import CompraRapidaView from '@/components/modules/compras/CompraRapidaView'

interface Props { params: { tenant: string } }

export default async function CompraRapidaPage({ params }: Props) {
  return (
    <TenantLayout tenantSlug={params.tenant}>
      <CompraRapidaView tenantSlug={params.tenant} />
    </TenantLayout>
  )
}