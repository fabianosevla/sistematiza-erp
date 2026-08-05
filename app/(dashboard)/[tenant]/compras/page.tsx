// ESTE ARQUIVO VAI EM: app/(dashboard)/[tenant]/compras/page.tsx
//
// Compras virou UMA tela. A antiga "Visão geral" (cotação, requisição, pedido
// de compra, conferência, listas e MRP) foi removida: era o fluxo de uma
// indústria com departamento de suprimentos, e aqui ninguém preenchia.
// A sugestão de compra, que era a parte útil do MRP, foi para dentro desta
// tela como o bloco "Precisa comprar".
import TenantLayout from '@/app/(dashboard)/tenant-layout'
import CompraRapidaView from '@/components/modules/compras/CompraRapidaView'

interface Props { params: { tenant: string } }

export default async function ComprasPage({ params }: Props) {
  return (
    <TenantLayout tenantSlug={params.tenant}>
      <CompraRapidaView tenantSlug={params.tenant} />
    </TenantLayout>
  )
}
