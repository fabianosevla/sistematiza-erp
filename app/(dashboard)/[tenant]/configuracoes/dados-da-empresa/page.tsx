import TenantLayout from '@/app/(dashboard)/tenant-layout'
import DadosEmpresaView from '@/components/modules/configuracoes/DadosEmpresaView'
interface Props { params: { tenant: string } }
export default async function ConfiguracoesDadosEmpresaPage({ params }: Props) {
  return <TenantLayout tenantSlug={params.tenant}><DadosEmpresaView tenantSlug={params.tenant} /></TenantLayout>
}
