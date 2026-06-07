import TenantLayout     from '@/app/(dashboard)/tenant-layout'
import VendaDetalheView from '@/components/modules/vendas/VendaDetalheView'
interface Props { params: { tenant: string; id: string } }
export default async function VendaDetalhePage({ params }: Props) {
  return <TenantLayout tenantSlug={params.tenant}><VendaDetalheView tenantSlug={params.tenant} vendaId={Number(params.id)} /></TenantLayout>
}