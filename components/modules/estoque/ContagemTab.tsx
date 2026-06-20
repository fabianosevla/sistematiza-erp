'use client'
// components/modules/estoque/ContagemTab.tsx
// ⚠️ VERSÃO PROVISÓRIA — substituída na próxima entrega

interface Props { tenantSlug: string }

export default function ContagemTab({}: Props) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
      <p className="text-sm text-gray-400">Contagem de Inventário em construção — chega na próxima entrega.</p>
    </div>
  )
}