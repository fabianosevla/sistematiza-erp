import TenantLayout       from '@/app/(dashboard)/tenant-layout'
import MetasResumoView    from '@/components/modules/metas/MetasResumoView'

interface Props { params: { tenant: string } }

export default async function MetasPage({ params }: Props) {
  return (
    <TenantLayout tenantSlug={params.tenant}>
      <MetasResumoView tenantSlug={params.tenant} />
    </TenantLayout>
  )
}
