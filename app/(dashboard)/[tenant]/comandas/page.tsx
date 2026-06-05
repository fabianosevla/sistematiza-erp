import TenantLayout from '@/app/(dashboard)/tenant-layout'
import ComandasView from '@/components/modules/comandas/ComandasView'

interface Props { params: { tenant: string } }

export default async function ComandasPage({ params }: Props) {
  return (
    <TenantLayout tenantSlug={params.tenant}>
      <ComandasView tenantSlug={params.tenant} />
    </TenantLayout>
  )
}