import TenantLayout from '@/app/(dashboard)/tenant-layout'
import FormasPagamentoView from '@/components/modules/cadastros/FormasPagamentoView'

interface Props { params: { tenant: string } }

export default async function FormasPagamentoPage({ params }: Props) {
  return (
    <TenantLayout tenantSlug={params.tenant}>
      <FormasPagamentoView tenantSlug={params.tenant} />
    </TenantLayout>
  )
}