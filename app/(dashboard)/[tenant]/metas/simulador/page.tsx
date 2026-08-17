import TenantLayout    from '@/app/(dashboard)/tenant-layout'
import SimuladorView   from '@/components/modules/metas/SimuladorView'

interface Props { params: { tenant: string } }

export default async function SimuladorPage({ params }: Props) {
  return (
    <TenantLayout tenantSlug={params.tenant}>
      <SimuladorView tenantSlug={params.tenant} />
    </TenantLayout>
  )
}
