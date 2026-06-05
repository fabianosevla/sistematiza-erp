import TenantLayout from '@/app/(dashboard)/tenant-layout'
import ClientesView from '@/components/modules/cadastros/ClientesView'
interface Props { params: { tenant: string } }
export default async function ClientesPage({ params }: Props) {
  return <TenantLayout tenantSlug={params.tenant}><ClientesView tenantSlug={params.tenant} /></TenantLayout>
}