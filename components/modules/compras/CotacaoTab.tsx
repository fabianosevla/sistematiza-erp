'use client'
// components/modules/compras/CotacaoTab.tsx
// ⚠️ VERSÃO PROVISÓRIA — será substituída na próxima entrega pela versão completa
// (comparação de preços por fornecedor, seleção do melhor preço, geração de pedidos)

interface Props {
  tenantSlug:      string
  listaIdInicial:  number | null
  onPedidosGerados: () => void
}

export default function CotacaoTab({ listaIdInicial }: Props) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
      <p className="text-sm text-gray-400">
        Tela de Cotação em construção — chega na próxima entrega.
      </p>
      {listaIdInicial && (
        <p className="text-xs text-gray-300 mt-2">Lista selecionada: #{listaIdInicial}</p>
      )}
    </div>
  )
}