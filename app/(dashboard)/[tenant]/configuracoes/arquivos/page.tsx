import TenantLayout from '@/app/(dashboard)/tenant-layout'
import ArquivosView from '@/components/modules/configuracoes/ArquivosView'
interface Props { params: { tenant: string } }
export default async function ConfiguracoesArquivosPage({ params }: Props) {
  return <TenantLayout tenantSlug={params.tenant}><ArquivosView tenantSlug={params.tenant} /></TenantLayout>
}
