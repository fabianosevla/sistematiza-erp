// ESTE ARQUIVO VAI EM: app/cardapio/[tenant]/page.tsx
//
// Página pública do cardápio — fora do grupo (dashboard) de propósito: sem
// sidebar, sem Header, sem Clerk. Pensada para abrir no celular do cliente
// via link ou QR Code (ver Configurações → Cardápio online).
import CardapioPublico from '@/components/cardapio/CardapioPublico'

export default function CardapioPage({ params }: { params: { tenant: string } }) {
  return <CardapioPublico tenantSlug={params.tenant} />
}
