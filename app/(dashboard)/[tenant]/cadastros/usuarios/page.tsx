import TenantLayout from '@/app/(dashboard)/tenant-layout'
import UsuariosView from '@/components/modules/cadastros/UsuariosView'
interface Props { params: { tenant: string } }
export default async function UsuariosPage({ params }: Props) {
  return <TenantLayout tenantSlug={params.tenant}><UsuariosView tenantSlug={params.tenant} /></TenantLayout>
}