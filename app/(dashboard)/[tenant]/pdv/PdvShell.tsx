'use client'
// app/(dashboard)/[tenant]/pdv/PdvShell.tsx
//
// Shell do PDV. Reaproveita os módulos reais já existentes:
//   - Aba Comanda → ComandasView (o componente real, não uma cópia)
//   - Aba Balcão  → PdvBalcao (venda rápida usando a API real de /vendas)
//   - Aba Mesas   → PdvMesas (grade que abre/lista comandas reais)

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ShoppingCart, LayoutGrid, ClipboardList, LogOut } from 'lucide-react'
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
  const router = useRouter()
  const [aba, setAba] = useState<Aba>('balcao')

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-gray-50">

      <header className="h-14 bg-white border-b border-gray-100 flex items-center justify-between px-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-baseline">
            <span className="text-lg font-bold text-gray-900">sistematiza</span>
            <span className="text-lg font-bold" style={{ color: '#2ecc71' }}>.ia</span>
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

        <button
          onClick={() => router.push(`/${tenantSlug}/selecionar-modulo`)}
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-700 transition-colors px-3 py-2 rounded-lg hover:bg-gray-50"
        >
          <LogOut size={15} />
          Sair
        </button>
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

        {/* ComandasView é o componente real do Gerencial — nada reescrito aqui */}
        <div className={`h-full ${aba === 'comanda' ? 'block' : 'hidden'}`}>
          <div className="h-full overflow-y-auto p-6">
            <ComandasView tenantSlug={tenantSlug} />
          </div>
        </div>
      </main>
    </div>
  )
}