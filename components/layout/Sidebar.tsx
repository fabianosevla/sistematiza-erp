'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Users, Boxes, ShoppingCart, FileText,
  DollarSign, ChevronDown, ChevronRight, ClipboardList,
  Factory, CreditCard, BarChart3,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState } from 'react'

interface Props {
  tenantSlug:    string
  tenantName:    string
  comandasAtivo: boolean
  producaoAtivo: boolean
  vendasAtivo:   boolean
  estoqueAtivo:  boolean
  fiscalAtivo:   boolean
}

export default function Sidebar({ tenantSlug, tenantName, comandasAtivo, producaoAtivo, vendasAtivo, estoqueAtivo, fiscalAtivo }: Props) {
  const pathname    = usePathname()
  const [open, setOpen] = useState<string[]>(['Cadastros'])
  const base = `/${tenantSlug}`

  const items = [
    { label: 'Dashboard', href: '', icon: BarChart3 },
    {
      label: 'Cadastros', icon: Users,
      children: [
        { label: 'Clientes',         href: '/cadastros/clientes' },
        { label: 'Fornecedores',     href: '/cadastros/fornecedores' },
        { label: 'Produtos',         href: '/cadastros/produtos' },
        { label: 'Insumos',          href: '/cadastros/insumos' },
        { label: 'Formas Pagamento', href: '/cadastros/formas-pagamento' },
        { label: 'Usuários',         href: '/cadastros/usuarios' },
      ],
    },
    { label: 'Pedidos',    href: '/pedidos',    icon: ClipboardList },
    ...(producaoAtivo  ? [{ label: 'Produção',   href: '/producao',   icon: Factory }]       : []),
    ...(estoqueAtivo   ? [{ label: 'Estoque',    href: '/estoque',    icon: Boxes }]         : []),
    ...(comandasAtivo  ? [{ label: 'Comandas',   href: '/comandas',   icon: FileText }]      : []),
    ...(vendasAtivo    ? [{ label: 'Vendas',     href: '/vendas',     icon: ShoppingCart }]  : []),
    ...(fiscalAtivo    ? [{ label: 'Fiscal',     href: '/fiscal',     icon: CreditCard }]    : []),
    { label: 'Financeiro', href: '/financeiro', icon: DollarSign },
  ]

  function toggleGroup(label: string) {
    setOpen(prev => prev.includes(label) ? prev.filter(g => g !== label) : [...prev, label])
  }

  function isActive(href: string) {
    const full = `${base}${href}`
    return href === '' ? pathname === base : pathname.startsWith(full)
  }

  const linkStyle = (active: boolean) => ({
    ...(active ? { backgroundColor: 'rgba(46,204,113,0.12)', borderLeft: '2px solid #2ecc71' } : {}),
  })

  return (
    <aside className="flex flex-col w-60 min-h-screen flex-shrink-0" style={{ backgroundColor: 'var(--color-sidebar)' }}>
      <div className="px-6 py-5 border-b border-white/10">
        <div className="flex items-baseline">
          <span className="text-xl font-semibold text-white tracking-tight">sistematiza</span>
          <span className="text-xl font-semibold tracking-tight" style={{ color: 'var(--color-accent)' }}>.ia</span>
        </div>
        <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>ERP</p>
      </div>

      <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
        {items.map(item => {
          if ('children' in item && item.children) {
            const isOpen = open.includes(item.label)
            const anyActive = item.children.some(c => isActive(c.href))
            return (
              <div key={item.label}>
                <button onClick={() => toggleGroup(item.label)}
                  className={cn('w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                    anyActive ? 'text-white' : 'text-white/50 hover:text-white/80')}>
                  <span className="flex items-center gap-3"><item.icon size={15} />{item.label}</span>
                  {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </button>
                {isOpen && (
                  <div className="ml-6 mt-0.5 space-y-0.5">
                    {item.children.map(child => {
                      const active = isActive(child.href)
                      return (
                        <Link key={child.href} href={`${base}${child.href}`}
                          style={linkStyle(active)}
                          className={cn('block px-3 py-1.5 rounded-md text-sm transition-colors',
                            active ? 'text-white font-medium' : 'text-white/40 hover:text-white/70')}>
                          {child.label}
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          }
          const active = isActive((item as any).href ?? '')
          return (
            <Link key={item.label} href={`${base}${(item as any).href ?? ''}`}
              style={linkStyle(active)}
              className={cn('flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                active ? 'text-white font-medium' : 'text-white/50 hover:text-white/80')}>
              <item.icon size={15} />{item.label}
            </Link>
          )
        })}
      </nav>
      <div className="px-4 py-4 border-t border-white/10">
        <p className="text-xs text-white/30 truncate">{tenantName}</p>
      </div>
    </aside>
  )
}