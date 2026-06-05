import TenantLayout from '@/app/(dashboard)/tenant-layout'
import FinanceiroView from '@/components/modules/financeiro/FinanceiroView'

interface Props { params: { tenant: string } }

export default async function FinanceiroPage({ params }: Props) {
  return (
    <TenantLayout tenantSlug={params.tenant}>
      <FinanceiroView tenantSlug={params.tenant} />
    </TenantLayout>
  )
}