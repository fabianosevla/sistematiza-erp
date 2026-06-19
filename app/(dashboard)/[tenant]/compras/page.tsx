// ════════════════════════════════════════════════════════════════════════
// ESTE ARQUIVO VAI EM: app/(dashboard)/[tenant]/compras/page.tsx
// (importa ComprasView — nome que você renomeou)
// ════════════════════════════════════════════════════════════════════════
import TenantLayout from '@/app/(dashboard)/tenant-layout'
import ComprasView from '@/components/modules/compras/ComprasView'

interface Props { params: { tenant: string } }

export default async function ComprasPage({ params }: Props) {
  return (
    <TenantLayout tenantSlug={params.tenant}>
      <ComprasView tenantSlug={params.tenant} />
    </TenantLayout>
  )
}