'use client'
// components/modules/compras/ConferenciaTab.tsx
// ⚠️ VERSÃO PROVISÓRIA — será substituída na próxima entrega pela versão completa
// (lançamento de quantidade recebida por item, finalização com entrada em
// estoque automática e geração de Conta a Pagar)

interface Props {
  tenantSlug:     string
  pedidoIdInicial: number | null
}

export default function ConferenciaTab({ pedidoIdInicial }: Props) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
      <p className="text-sm text-gray-400">
        Tela de Conferência de Recebimento em construção — chega na próxima entrega.
      </p>
      {pedidoIdInicial && (
        <p className="text-xs text-gray-300 mt-2">Pedido selecionado: #{pedidoIdInicial}</p>
      )}
    </div>
  )
}