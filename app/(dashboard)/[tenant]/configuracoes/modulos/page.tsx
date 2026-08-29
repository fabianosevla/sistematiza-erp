import TenantLayout from '@/app/(dashboard)/tenant-layout'
import HabilitacoesModulosView from '@/components/modules/configuracoes/HabilitacoesModulosView'
interface Props { params: { tenant: string } }
export default async function ConfiguracoesModulosPage({ params }: Props) {
  return <TenantLayout tenantSlug={params.tenant}><HabilitacoesModulosView tenantSlug={params.tenant} /></TenantLayout>
}
