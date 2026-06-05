import TenantLayout from '@/app/(dashboard)/tenant-layout'
import ProdutosView from '@/components/modules/cadastros/ProdutosView'
interface Props { params: { tenant: string } }
export default async function ProdutosPage({ params }: Props) {
  return <TenantLayout tenantSlug={params.tenant}><ProdutosView tenantSlug={params.tenant} /></TenantLayout>
}