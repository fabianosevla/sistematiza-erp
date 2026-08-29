import TenantLayout from '@/app/(dashboard)/tenant-layout'
import ConfiguracoesView from '@/components/modules/configuracoes/ConfiguracoesView'
interface Props { params: { tenant: string } }
export default async function ConfiguracoesPage({ params }: Props) {
  return <TenantLayout tenantSlug={params.tenant}><ConfiguracoesView tenantSlug={params.tenant} /></TenantLayout>
}
