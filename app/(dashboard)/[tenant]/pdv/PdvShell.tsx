'use client'
// app/(dashboard)/[tenant]/pdv/PdvShell.tsx

import { useState } from 'react'
import { useClerk } from '@clerk/nextjs'
import { useQuery } from '@tanstack/react-query'
import { ShoppingCart, LayoutGrid, ClipboardList, Bike, LogOut, Sun, Moon } from 'lucide-react'
import ComandasView from '@/components/modules/comandas/ComandasView'
import PdvBalcao from './PdvBalcao'
import PdvMesas from './PdvMesas'
import { useDarkMode } from '@/hooks/useDarkMode'

interface Props {
  tenantSlug: string
  darkModeInicial?: boolean
}

type Aba = 'balcao' | 'mesas' | 'comanda' | 'delivery'

const ABAS = [
  { key: 'balcao' as Aba, label: 'Balcão', icon: ShoppingCart },
  { key: 'mesas' as Aba, label: 'Mesas', icon: LayoutGrid },
  { key: 'comanda' as Aba, label: 'Comanda', icon: ClipboardList },
  { key: 'delivery' as Aba, label: 'Delivery', icon: Bike },
]

// Elemento de link referenciado por variavel em vez da tag JSX literal de
// ancora -- alguma etapa do transporte deste texto ate o arquivo no disco
// estava removendo essa tag toda vez que ela ficava sozinha numa linha
// seguida de atributos. Esta forma evita o problema por completo.
const Anchor = 'a' as const

// Mesma cor do menu lateral do gerencial. É a mesma aplicação — o PDV não
// pode parecer outro produto.
const COR_BARRA = '#0F1117'

export default function PdvShell({ tenantSlug, darkModeInicial = false }: Props) {
  const [aba, setAba] = useState<Aba>('balcao')
  const { signOut } = useClerk()
  const { darkMode, toggleDarkMode } = useDarkMode(tenantSlug, darkModeInicial)
  const { data: meuAcessoRaw } = useQuery({
    queryKey: ['meu-acesso-pdv', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/perfis/meu-acesso`)).json(),
    staleTime: 60000,
  })
  const temGerencial = meuAcessoRaw?.data?.isAdmin === true || meuAcessoRaw?.data?.acessoGerencial === true

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-gray-50">
      <header
        className="h-14 flex items-center justify-between px-4 flex-shrink-0 border-b border-white/5"
        style={{ backgroundColor: COR_BARRA }}
      >
        <div className="flex items-center gap-3">
          {/* Marca idêntica à do menu lateral do gerencial: mesmo ícone,
              mesma grafia, mesmo tamanho. */}
          <div className="flex items-center gap-2">
            <img src="/apple-icon.png" alt="" className="h-7 w-7 flex-shrink-0 rounded object-contain" />
            <div className="flex items-baseline">
              <span className="text-[19px] font-bold text-white tracking-tight">Sistematiza</span>
              <span className="text-[19px] font-bold tracking-tight" style={{ color: '#2ecc71' }}>.ai</span>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white/10 text-white/60 uppercase tracking-wide">
            PDV
          </span>
        </div>

        <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-xl p-1">
          {ABAS.map(item => (
            <button
              key={item.key}
              onClick={() => setAba(item.key)}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                aba === item.key
                  ? 'bg-[#2ecc71]/15 text-white'
                  : 'text-white/50 hover:text-white/80 hover:bg-white/5'
              }`}
            >
              <item.icon size={14} />
              {item.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={toggleDarkMode}
            className="p-2 text-white/60 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
            title={darkMode ? 'Modo claro' : 'Modo escuro'}
          >
            {darkMode ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          {temGerencial && (
            <Anchor
              href={`/${tenantSlug}`}
              className="flex items-center gap-2 text-sm text-white/60 hover:text-white transition-colors px-3 py-2 rounded-lg hover:bg-white/10"
              title="Voltar ao gerencial"
            >
              Gerencial
            </Anchor>
          )}
          <button
            onClick={() => signOut({ redirectUrl: '/sign-in' })}
            className="flex items-center gap-2 text-sm text-white/60 hover:text-red-400 transition-colors px-3 py-2 rounded-lg hover:bg-white/10"
            title="Sair do sistema"
          >
            <LogOut size={15} />
            Sair
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-hidden">
        {/* Balcão e Delivery têm rolagem própria (a grade de produtos rola, a
            barra do carrinho fica fixa embaixo), então aqui não pode haver
            um segundo contêiner rolável por fora. */}
        <div className={`h-full ${aba === 'balcao' ? 'block' : 'hidden'}`}>
          <div className="h-full overflow-hidden p-6">
            <PdvBalcao tenantSlug={tenantSlug} modo="balcao" />
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

        <div className={`h-full ${aba === 'delivery' ? 'block' : 'hidden'}`}>
          <div className="h-full overflow-hidden p-6">
            <PdvBalcao tenantSlug={tenantSlug} modo="delivery" />
          </div>
        </div>
      </main>
    </div>
  )
}