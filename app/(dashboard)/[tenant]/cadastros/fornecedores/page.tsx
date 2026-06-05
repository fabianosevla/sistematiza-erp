import TenantLayout from '@/app/(dashboard)/tenant-layout'
import FornecedoresView from '@/components/modules/cadastros/FornecedoresView'
interface Props { params: { tenant: string } }
export default async function FornecedoresPage({ params }: Props) {
  return <TenantLayout tenantSlug={params.tenant}><FornecedoresView tenantSlug={params.tenant} /></TenantLayout>
}