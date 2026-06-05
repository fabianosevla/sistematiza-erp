import TenantLayout from '@/app/(dashboard)/tenant-layout'
import PedidosView from '@/components/modules/pedidos/PedidosView'

interface Props { params: { tenant: string } }

export default async function PedidosPage({ params }: Props) {
  return (
    <TenantLayout tenantSlug={params.tenant}>
      <PedidosView tenantSlug={params.tenant} />
    </TenantLayout>
  )
}