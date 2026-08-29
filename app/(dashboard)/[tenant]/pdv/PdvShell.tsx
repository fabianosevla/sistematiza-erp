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

/**
 * ─── A BARRA DO PDV ACOMPANHOU O GERENCIAL ───────────────────────────────────
 *
 * O gerencial ficou claro, então a barra preta do PDV ficaria órfã: pareceria
 * outro produto. Agora ela é branca com hairline embaixo, igual ao cabeçalho
 * do gerencial.
 *
 * Uma diferença de propósito foi mantida de pé: o PDV é operado em pé, rápido,
 * às vezes em monitor ruim. Por isso as abas aqui continuam MAIORES que
 * qualquer controle do gerencial (h-9, texto 14px, alvo confortável) e a aba
 * ativa não é só sublinhada — é uma pastilha verde clara, que se acha de
 * relance sem procurar.
 *
 * Nada de comportamento mudou: mesmas quatro abas, mesma checagem de acesso
 * gerencial, mesmo dark mode, mesmas rolagens por aba.
 */

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
    <div className="h-screen flex flex-col overflow-hidden bg-gray-50 dark:bg-[#0E1120]">
      <header className="h-14 flex items-center justify-between px-4 flex-shrink-0 bg-white dark:bg-[#0F1117] border-b border-gray-200 dark:border-white/5">
        <div className="flex items-center gap-3">
          {/* Marca idêntica à do menu lateral do gerencial. */}
          <div className="flex items-center gap-2.5">
            <img src="/apple-icon.png" alt="" className="h-6 w-6 flex-shrink-0 rounded-md object-contain" />
            <div className="flex items-baseline">
              <span className="text-[15.5px] font-semibold tracking-tight text-gray-900 dark:text-white">Sistematiza</span>
              <span className="text-[15.5px] font-semibold tracking-tight text-green-600">.ai</span>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded-full text-[10.5px] font-medium bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-white/60">
            PDV
          </span>
        </div>

        {/* Abas grandes: é o controle mais usado da tela, e quem opera não
            está com a mão parada no mouse. */}
        <div className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-xl p-1 dark:bg-white/5 dark:border-white/10">
          {ABAS.map(item => (
            <button
              key={item.key}
              onClick={() => setAba(item.key)}
              className={`flex items-center gap-2 px-4 h-9 rounded-lg text-sm font-medium transition-colors ${
                aba === item.key
                  ? 'bg-green-50 text-green-800 dark:bg-[#2ecc71]/15 dark:text-white'
                  : 'text-gray-500 hover:text-gray-900 hover:bg-white dark:text-white/50 dark:hover:text-white/80 dark:hover:bg-white/5'
              }`}
            >
              <item.icon size={15} strokeWidth={2} />
              {item.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={toggleDarkMode}
            className="w-9 h-9 flex items-center justify-center text-gray-500 hover:text-gray-900 rounded-lg hover:bg-gray-100 transition-colors dark:text-white/60 dark:hover:text-white dark:hover:bg-white/10"
            title={darkMode ? 'Modo claro' : 'Modo escuro'}
          >
            {darkMode ? <Sun size={17} /> : <Moon size={17} />}
          </button>

          {temGerencial && (
            <Anchor
              href={`/${tenantSlug}`}
              className="flex items-center gap-2 text-[13px] font-medium text-gray-600 hover:text-gray-900 transition-colors px-3 h-9 rounded-lg hover:bg-gray-100 dark:text-white/60 dark:hover:text-white dark:hover:bg-white/10"
              title="Voltar ao gerencial"
            >
              Gerencial
            </Anchor>
          )}
          <button
            onClick={() => signOut({ redirectUrl: '/sign-in' })}
            className="flex items-center gap-2 text-[13px] font-medium text-gray-600 hover:text-red-600 transition-colors px-3 h-9 rounded-lg hover:bg-gray-100 dark:text-white/60 dark:hover:text-red-400 dark:hover:bg-white/10"
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
