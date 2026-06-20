'use client'
// components/modules/estoque/EstoqueAvancadoView.tsx

import { useState } from 'react'
import { Warehouse, AlertTriangle, ClipboardCheck, FileSpreadsheet } from 'lucide-react'
import LocaisTab    from './LocaisTab'
import PerdasTab    from './PerdasTab'
import ContagemTab  from './ContagemTab'
import EntradaNfeTab from './EntradaNfeTab'

interface Props { tenantSlug: string }

type Aba = 'locais' | 'perdas' | 'contagem' | 'nfe'

const ABAS: { key: Aba; label: string; icon: any }[] = [
  { key: 'locais',   label: 'Locais',       icon: Warehouse },
  { key: 'perdas',   label: 'Perdas',       icon: AlertTriangle },
  { key: 'contagem', label: 'Contagem',     icon: ClipboardCheck },
  { key: 'nfe',      label: 'Entrada NF-e', icon: FileSpreadsheet },
]

export default function EstoqueAvancadoView({ tenantSlug }: Props) {
  const [aba, setAba] = useState<Aba>('locais')

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Estoque Avançado</h1>
        <p className="text-sm text-gray-400 mt-0.5">Locais, perdas, contagem de inventário e entrada via NF-e</p>
      </div>

      <div className="border-b border-gray-100 mb-6 overflow-x-auto">
        <div className="flex gap-0 min-w-max">
          {ABAS.map(a => (
            <button key={a.key} onClick={() => setAba(a.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                aba === a.key ? 'border-green-500 text-green-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              <a.icon size={14} />
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {aba === 'locais'   && <LocaisTab tenantSlug={tenantSlug} />}
      {aba === 'perdas'   && <PerdasTab tenantSlug={tenantSlug} />}
      {aba === 'contagem' && <ContagemTab tenantSlug={tenantSlug} />}
      {aba === 'nfe'      && <EntradaNfeTab tenantSlug={tenantSlug} />}
    </div>
  )
}