import TenantLayout from '@/app/(dashboard)/tenant-layout'
import FiscalConfigView from '@/components/modules/configuracoes/FiscalConfigView'
interface Props { params: { tenant: string } }
export default async function ConfiguracoesFiscalPage({ params }: Props) {
  return <TenantLayout tenantSlug={params.tenant}><FiscalConfigView tenantSlug={params.tenant} /></TenantLayout>
}
