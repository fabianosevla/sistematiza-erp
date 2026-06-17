'use client'
// app/(dashboard)/[tenant]/selecionar-modulo/SelecionarModuloClient.tsx

import { useRouter } from 'next/navigation'
import { BarChart3, ShoppingCart, ClipboardList, Truck } from 'lucide-react'

interface Props {
  tenantSlug: string
  acessos: {
    gerencial: boolean
    pdv:       boolean
    comanda:   boolean
    delivery:  boolean
  }
}

const MODULOS = [
  {
    key:         'gerencial' as const,
    label:       'Gerencial',
    descricao:   'Acesso completo ao sistema',
    icon:        BarChart3,
    href:        (slug: string) => `/${slug}`,
    gradient:    'from-[#0F1117] to-[#1a1f2e]',
    iconBg:      'bg-[#2ecc71]/10',
    iconColor:   'text-[#2ecc71]',
    borderHover: 'hover:border-[#2ecc71]/40',
  },
  {
    key:         'pdv' as const,
    label:       'PDV',
    descricao:   'Ponto de venda',
    icon:        ShoppingCart,
    href:        (slug: string) => `/${slug}/pdv`,
    gradient:    'from-blue-950 to-blue-900',
    iconBg:      'bg-blue-400/10',
    iconColor:   'text-blue-400',
    borderHover: 'hover:border-blue-400/40',
  },
  {
    key:         'comanda' as const,
    label:       'Comanda',
    descricao:   'Comanda eletrônica',
    icon:        ClipboardList,
    href:        (slug: string) => `/${slug}/comandas`,
    gradient:    'from-purple-950 to-purple-900',
    iconBg:      'bg-purple-400/10',
    iconColor:   'text-purple-400',
    borderHover: 'hover:border-purple-400/40',
  },
  {
    key:         'delivery' as const,
    label:       'Delivery',
    descricao:   'Gestão de entregas',
    icon:        Truck,
    href:        (slug: string) => `/${slug}/pedidos`,
    gradient:    'from-orange-950 to-orange-900',
    iconBg:      'bg-orange-400/10',
    iconColor:   'text-orange-400',
    borderHover: 'hover:border-orange-400/40',
  },
]

export default function SelecionarModuloClient({ tenantSlug, acessos }: Props) {
  const router = useRouter()

  const disponiveis = MODULOS.filter(m => acessos[m.key])

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ backgroundColor: '#0F1117' }}
    >
      {/* Logo */}
      <div className="text-center mb-10">
        <div className="flex items-baseline justify-center gap-0.5">
          <span className="text-3xl font-bold text-white tracking-tight">sistematiza</span>
          <span className="text-3xl font-bold tracking-tight" style={{ color: '#2ecc71' }}>.ia</span>
        </div>
        <p className="text-white/30 text-sm mt-2">Selecione o ambiente de trabalho</p>
      </div>

      {/* Cards de módulo */}
      <div className={`
        grid gap-4 w-full max-w-3xl
        ${disponiveis.length === 1 ? 'grid-cols-1 max-w-xs' : ''}
        ${disponiveis.length === 2 ? 'grid-cols-2 max-w-lg' : ''}
        ${disponiveis.length === 3 ? 'grid-cols-3' : ''}
        ${disponiveis.length === 4 ? 'grid-cols-2 sm:grid-cols-4' : ''}
      `}>
        {disponiveis.map(modulo => {
          const Icon = modulo.icon
          return (
            <button
              key={modulo.key}
              onClick={() => router.push(modulo.href(tenantSlug))}
              className={`
                group relative flex flex-col items-center justify-center
                gap-4 p-8 rounded-2xl border border-white/5
                bg-gradient-to-b ${modulo.gradient}
                ${modulo.borderHover}
                transition-all duration-200
                hover:scale-[1.02] hover:shadow-2xl hover:shadow-black/40
                active:scale-[0.98]
                cursor-pointer
              `}
            >
              {/* Ícone */}
              <div className={`
                w-16 h-16 rounded-2xl flex items-center justify-center
                ${modulo.iconBg} transition-transform duration-200
                group-hover:scale-110
              `}>
                <Icon size={32} className={modulo.iconColor} />
              </div>

              {/* Label */}
              <div className="text-center">
                <p className="text-white font-semibold text-lg leading-tight">
                  {modulo.label}
                </p>
                <p className="text-white/40 text-xs mt-1">
                  {modulo.descricao}
                </p>
              </div>

              {/* Seta hover */}
              <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className={`w-6 h-6 rounded-full ${modulo.iconBg} flex items-center justify-center`}>
                  <span className={`text-xs ${modulo.iconColor}`}>→</span>
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Rodapé */}
      <p className="text-white/20 text-xs mt-10">
        Apenas ambientes autorizados para seu perfil são exibidos
      </p>
    </div>
  )
}