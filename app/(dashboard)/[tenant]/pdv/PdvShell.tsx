'use client'
// app/(dashboard)/[tenant]/pdv/PdvShell.tsx

import { useState } from 'react'
import { ShoppingCart, LayoutGrid, ClipboardList, LogOut, Code2 } from 'lucide-react'
import ComandasView from '@/components/modules/comandas/ComandasView'
import PdvBalcao from './PdvBalcao'
import PdvMesas from './PdvMesas'

interface Props { tenantSlug: string }

type Aba = 'balcao' | 'mesas' | 'comanda'

const ABAS = [
  { key: 'balcao'  as Aba, label: 'Balcão',  icon: ShoppingCart },
  { key: 'mesas'   as Aba, label: 'Mesas',   icon: LayoutGrid   },
  { key: 'comanda' as Aba, label: 'Comanda', icon: ClipboardList },
]

export default function PdvShell({ tenantSlug }: Props) {
  const [aba, setAba] = useState<Aba>('balcao')

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-gray-50">

      <header className="h-14 bg-white border-b border-gray-100 flex items-center justify-between px-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Code2 size={18} style={{ color: '#2ecc71' }} />
            <div className="flex items-baseline">
              <span className="text-lg font-bold text-gray-900">sistematiza</span>
              <span className="text-lg font-bold" style={{ color: '#2ecc71' }}>.ia</span>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-500 uppercase tracking-wide">
            PDV
          </span>
        </div>

        <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
          {ABAS.map(a => (
            <button
              key={a.key}
              onClick={() => setAba(a.key)}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                aba === a.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <a.icon size={14} />
              {a.label}
            </button>
          ))}
        </div>

        {/* ⚠️ <a href> em vez de router.push() — navegação completa,
            evita o bug de cache do App Router entre /[tenant] e /[tenant]/pdv */}
        <a
          href={`/${tenantSlug}/selecionar-modulo`}
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-700 transition-colors px-3 py-2 rounded-lg hover:bg-gray-50"
        >
          <LogOut size={15} />
          Sair
        </a>
      </header>

      <main className="flex-1 overflow-hidden">
        <div className={`h-full ${aba === 'balcao' ? 'block' : 'hidden'}`}>
          <div className="h-full overflow-y-auto p-6">
            <PdvBalcao tenantSlug={tenantSlug} />
          </div>
        </div>

        <div className={`h-full ${aba === 'mesas' ? 'block' : 'hidden'}`}>
          <div className="h-full overflow-y-auto p-6">
            <PdvMesas tenantSlug={tenantSlug} onAbrirComanda={() => setAba('comanda')} />
          </div>
        </div>

        <div className={`h-full ${aba === 'comanda' ? 'block' : 'hidden'}`}>
          <div className="h-full overflow-y-auto p-6">
            <ComandasView tenantSlug={tenantSlug} />
          </div>
        </div>
      </main>
    </div>
  )
}