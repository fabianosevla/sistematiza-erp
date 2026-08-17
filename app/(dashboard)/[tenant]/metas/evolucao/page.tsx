import TenantLayout   from '@/app/(dashboard)/tenant-layout'
import EvolucaoView    from '@/components/modules/metas/EvolucaoView'

interface Props { params: { tenant: string } }

export default async function EvolucaoPage({ params }: Props) {
  return (
    <TenantLayout tenantSlug={params.tenant}>
      <EvolucaoView tenantSlug={params.tenant} />
    </TenantLayout>
  )
}
