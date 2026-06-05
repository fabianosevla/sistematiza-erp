import TenantLayout from '@/app/(dashboard)/tenant-layout'
import ProducaoView from '@/components/modules/producao/ProducaoView'

interface Props { params: { tenant: string } }

export default async function ProducaoPage({ params }: Props) {
  return (
    <TenantLayout tenantSlug={params.tenant}>
      <ProducaoView tenantSlug={params.tenant} />
    </TenantLayout>
  )
}