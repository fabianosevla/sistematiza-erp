import TenantLayout           from '@/app/(dashboard)/tenant-layout'
import PrevisaoProducaoView   from '@/components/modules/metas/PrevisaoProducaoView'

interface Props { params: { tenant: string } }

export default async function PrevisaoProducaoPage({ params }: Props) {
  return (
    <TenantLayout tenantSlug={params.tenant}>
      <PrevisaoProducaoView tenantSlug={params.tenant} />
    </TenantLayout>
  )
}
