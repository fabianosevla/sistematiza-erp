import TenantLayout from '@/app/(dashboard)/tenant-layout'
import FidelidadeView from '@/components/modules/fidelidade/FidelidadeView'

interface Props { params: { tenant: string } }

export default async function FidelidadePage({ params }: Props) {
  return <TenantLayout tenantSlug={params.tenant}><FidelidadeView tenantSlug={params.tenant} /></TenantLayout>
}