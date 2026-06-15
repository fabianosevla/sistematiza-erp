import TenantLayout from '@/app/(dashboard)/tenant-layout'
import MetasView    from '@/components/modules/metas/MetasView'

interface Props { params: { tenant: string } }

export default async function MetasPage({ params }: Props) {
  return (
    <TenantLayout tenantSlug={params.tenant}>
      <MetasView tenantSlug={params.tenant} />
    </TenantLayout>
  )
}