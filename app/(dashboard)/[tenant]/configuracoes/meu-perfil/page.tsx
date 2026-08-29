import TenantLayout from '@/app/(dashboard)/tenant-layout'
import MeuPerfilView from '@/components/modules/configuracoes/MeuPerfilView'
interface Props { params: { tenant: string } }
export default async function ConfiguracoesMeuPerfilPage({ params }: Props) {
  return <TenantLayout tenantSlug={params.tenant}><MeuPerfilView tenantSlug={params.tenant} /></TenantLayout>
}
