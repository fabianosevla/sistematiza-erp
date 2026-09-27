import TenantLayout  from '@/app/(dashboard)/tenant-layout'
import Ficha360View  from '@/components/modules/crm/Ficha360View'

interface Props { params: { tenant: string; id: string }; searchParams?: { origem?: string } }

export default async function Ficha360Page({ params, searchParams }: Props) {
  return (
    <TenantLayout tenantSlug={params.tenant}>
      <Ficha360View tenantSlug={params.tenant} clienteId={Number(params.id)} origem={searchParams?.origem} />
    </TenantLayout>
  )
}
