'use client'
// app/(dashboard)/[tenant]/selecionar-modulo/SelecionarModuloClient.tsx

import { useRouter } from 'next/navigation'
import { BarChart3, ShoppingCart } from 'lucide-react'

interface Props {
  tenantSlug: string
  acessos: {
    gerencial: boolean
    pdv:       boolean
    comanda:   boolean
    delivery:  boolean
  }
}

// ⚠️ Comanda e Delivery foram REMOVIDOS desta tela.
// Eles não têm ambiente dedicado ainda — Comanda já existe como aba
// dentro do PDV (PdvShell → aba "Comanda"), e Delivery ainda não tem
// nenhuma tela própria. Mostrar cards que levam para dentro do Gerencial
// quebra a promessa da tela ("escolha seu ambiente") e confunde o usuário.
// Quando esses ambientes existirem de verdade, adicionar de volta aqui.
const MODULOS = [
  {
    key:         'gerencial' as const,
    label:       'Gerencial',
    descricao:   'Acesso completo ao sistema',
    icon:        BarChart3,
    href:        (slug: string) => `/${slug}`,
    iconBg:      'bg-[#2ecc71]/10',
    iconColor:   'text-[#2ecc71]',
    borderHover: 'hover:border-[#2ecc71]/40',
  },
  {
    key:         'pdv' as const,
    label:       'PDV',
    descricao:   'Vendas, mesas e comandas',
    icon:        ShoppingCart,
    href:        (slug: string) => `/${slug}/pdv`,
    iconBg:      'bg-blue-100',
    iconColor:   'text-blue-600',
    borderHover: 'hover:border-blue-300',
  },
]

export default function SelecionarModuloClient({ tenantSlug, acessos }: Props) {
  const router = useRouter()

  const disponiveis = MODULOS.filter(m => acessos[m.key])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-gray-50">

      {/* Logo */}
      <div className="text-center mb-10">
        <div className="flex items-baseline justify-center gap-0.5">
          <span className="text-2xl font-bold text-gray-900">sistematiza</span>
          <span className="text-2xl font-bold" style={{ color: '#2ecc71' }}>.ia</span>
        </div>
        <p className="text-gray-400 text-sm mt-2">Selecione o ambiente de trabalho</p>
      </div>

      {/* Cards de módulo */}
      <div className={`grid gap-4 w-full ${disponiveis.length === 1 ? 'grid-cols-1 max-w-xs' : 'grid-cols-2 max-w-lg'}`}>
        {disponiveis.map(modulo => {
          const Icon = modulo.icon
          return (
            <button
              key={modulo.key}
              onClick={() => router.push(modulo.href(tenantSlug))}
              className={`
                group relative flex flex-col items-center justify-center
                gap-4 p-8 rounded-2xl border border-gray-200 bg-white
                ${modulo.borderHover}
                transition-all duration-200
                hover:scale-[1.02] hover:shadow-lg
                active:scale-[0.98]
                cursor-pointer
              `}
            >
              <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${modulo.iconBg} transition-transform duration-200 group-hover:scale-110`}>
                <Icon size={32} className={modulo.iconColor} />
              </div>
              <div className="text-center">
                <p className="text-gray-900 font-semibold text-lg leading-tight">{modulo.label}</p>
                <p className="text-gray-400 text-xs mt-1">{modulo.descricao}</p>
              </div>
            </button>
          )
        })}
      </div>

      {disponiveis.length === 0 && (
        <p className="text-sm text-gray-400 mt-4">Nenhum ambiente disponível para seu perfil.</p>
      )}
    </div>
  )
}