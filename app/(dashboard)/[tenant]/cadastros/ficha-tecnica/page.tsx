import TenantLayout     from '@/app/(dashboard)/tenant-layout'
import FichaTecnicaView from '@/components/modules/cadastros/FichaTecnicaView'

interface Props { params: { tenant: string } }

export default async function FichaTecnicaPage({ params }: Props) {
  return (
    <TenantLayout tenantSlug={params.tenant}>
      <FichaTecnicaView tenantSlug={params.tenant} />
    </TenantLayout>
  )
}