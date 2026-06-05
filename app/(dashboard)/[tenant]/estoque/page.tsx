import TenantLayout from '@/app/(dashboard)/tenant-layout'
import EstoqueView from '@/components/modules/estoque/EstoqueView'
interface Props { params: { tenant: string } }
export default async function EstoquePage({ params }: Props) {
  return <TenantLayout tenantSlug={params.tenant}><EstoqueView tenantSlug={params.tenant} /></TenantLayout>
}