import TenantLayout from '@/app/(dashboard)/tenant-layout'
import EstoqueAvancadoView from '@/components/modules/estoque/EstoqueAvancadoView'

interface Props { params: { tenant: string } }

export default async function EstoqueAvancadoPage({ params }: Props) {
  return (
    <TenantLayout tenantSlug={params.tenant}>
      <EstoqueAvancadoView tenantSlug={params.tenant} />
    </TenantLayout>
  )
}