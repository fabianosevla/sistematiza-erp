import TenantLayout        from '@/app/(dashboard)/tenant-layout'
import CardapioDigitalView from '@/components/modules/cardapio-digital/CardapioDigitalView'

interface Props { params: { tenant: string } }

export default async function CardapioDigitalPage({ params }: Props) {
  return (
    <TenantLayout tenantSlug={params.tenant}>
      <CardapioDigitalView tenantSlug={params.tenant} />
    </TenantLayout>
  )
}
