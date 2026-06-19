'use client'
// components/modules/compras/PedidosTab.tsx
// ⚠️ VERSÃO PROVISÓRIA — será substituída na próxima entrega pela versão completa

interface Props {
  tenantSlug:          string
  onIniciarConferencia: (pedidoId: number) => void
}

export default function PedidosTab({}: Props) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
      <p className="text-sm text-gray-400">
        Tela de Pedidos de Compra em construção — chega na próxima entrega.
      </p>
    </div>
  )
}