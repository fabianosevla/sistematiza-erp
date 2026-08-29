import TenantLayout from '@/app/(dashboard)/tenant-layout'
import CaixaView from '@/components/modules/configuracoes/CaixaView'
interface Props { params: { tenant: string } }
export default async function ConfiguracoesCaixaPage({ params }: Props) {
  return <TenantLayout tenantSlug={params.tenant}><CaixaView tenantSlug={params.tenant} /></TenantLayout>
}
