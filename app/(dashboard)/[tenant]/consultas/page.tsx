import TenantLayout  from '@/app/(dashboard)/tenant-layout'
import ConsultasView from '@/components/modules/consultas/ConsultasView'
interface Props { params: { tenant: string } }
export default async function ConsultasPage({ params }: Props) {
  return <TenantLayout tenantSlug={params.tenant}><ConsultasView tenantSlug={params.tenant} /></TenantLayout>
}