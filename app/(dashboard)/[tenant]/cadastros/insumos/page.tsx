import TenantLayout from '@/app/(dashboard)/tenant-layout'
import InsumosView from '@/components/modules/cadastros/InsumosView'
interface Props { params: { tenant: string } }
export default async function InsumosPage({ params }: Props) {
  return <TenantLayout tenantSlug={params.tenant}><InsumosView tenantSlug={params.tenant} /></TenantLayout>
}