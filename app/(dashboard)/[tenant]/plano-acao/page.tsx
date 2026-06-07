import TenantLayout    from '@/app/(dashboard)/tenant-layout'
import PlanoAcaoView   from '@/components/modules/plano_acao/PlanoAcaoView'
interface Props { params: { tenant: string } }
export default async function PlanoAcaoPage({ params }: Props) {
  return <TenantLayout tenantSlug={params.tenant}><PlanoAcaoView tenantSlug={params.tenant} /></TenantLayout>
}