'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BarChart3, Users, Boxes, ShoppingCart, DollarSign,
  ChevronRight, ClipboardList, Factory, CreditCard,
  Search, ClipboardCheck, X, Target, Code2, ShoppingBag,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Config } from '@/components/layout/ClientShell'

interface Props {
  tenantSlug: string; tenantName: string; config: Config
  open: boolean; onClose: () => void
}

export default function Sidebar({ tenantSlug, tenantName, config, open, onClose }: Props) {
  const pathname = usePathname()
  const base     = `/${tenantSlug}`
  const initials = tenantName.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()

  const fixos = [
    { label: 'Dashboard', href: '', icon: BarChart3 },
    {
      label: 'Cadastros', icon: Users,
      children: [
        { label: 'Clientes',          href: '/cadastros/clientes' },
        { label: 'Fornecedores',      href: '/cadastros/fornecedores' },
        { label: 'Produtos',          href: '/cadastros/produtos' },
        { label: 'Insumos',           href: '/cadastros/insumos' },
        { label: 'Fichas Técnicas',   href: '/cadastros/ficha-tecnica' },
        { label: 'Formas Pagamento',  href: '/cadastros/formas-pagamento' },
        { label: 'Usuários',          href: '/cadastros/usuarios' },
        { label: 'Perfis de Acesso',  href: '/perfis' },
        { label: 'Domínios',          href: '/cadastros/dominios' },
      ],
    },
  ]

  const modulares = [
    ...(config.metasAtivo     ? [{ label: 'Metas & Simulador', href: '/metas',      icon: Target }]        : []),
    ...(config.consultasAtivo ? [{ label: 'Consultas',         href: '/consultas',  icon: Search }]         : []),
    ...(config.pedidosAtivo   ? [{ label: 'Pedidos',           href: '/pedidos',    icon: ClipboardList }]  : []),
    ...(config.comprasAtivo   ? [{ label: 'Compras',           href: '/compras',    icon: ShoppingBag }]    : []),
    ...(config.planoAcaoAtivo ? [{ label: 'Plano de Ação',     href: '/plano-acao', icon: ClipboardCheck }] : []),
    ...(config.producaoAtivo  ? [{ label: 'Produção',          href: '/producao',   icon: Factory }]        : []),
    ...(config.estoqueAtivo   ? [{ label: 'Estoque',           href: '/estoque',    icon: Boxes }]          : []),
    ...(config.comandasAtivo  ? [{ label: 'Comandas',          href: '/comandas',   icon: CreditCard }]     : []),
    ...(config.fiscalAtivo    ? [{ label: 'Fiscal',            href: '/fiscal',     icon: CreditCard }]     : []),
  ]

  const finais = [
    { label: 'Vendas',     href: '/vendas',     icon: ShoppingCart },
    { label: 'Financeiro', href: '/financeiro', icon: DollarSign },
  ]

  const allItems = [...fixos, ...modulares, ...finais]

  function isActive(href: string) {
    const full = `${base}${href}`
    return href === '' ? pathname === base : pathname.startsWith(full)
  }

  return (
    <aside
      className={cn(
        'fixed lg:static inset-y-0 left-0 z-40 w-60 h-screen flex flex-col flex-shrink-0',
        'transition-transform duration-300 ease-in-out',
        open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      )}
      style={{ backgroundColor: '#0F1117' }}>

      <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-white/5">
        <div className="flex items-center gap-2">
          <Code2 size={18} style={{ color: '#2ecc71' }} />
          <div className="flex items-baseline">
            <span className="text-[19px] font-bold text-white tracking-tight">sistematiza</span>
            <span className="text-[19px] font-bold tracking-tight" style={{ color: '#2ecc71' }}>.ia</span>
          </div>
        </div>
        <button onClick={onClose} className="lg:hidden text-white/30 hover:text-white/70 p-1 rounded">
          <X size={16} />
        </button>
      </div>

      <nav className="flex-1 px-2 py-3 overflow-y-auto space-y-0.5">
        {allItems.map(item => {
          if ('children' in item && item.children) {
            const anyActive = item.children.some(c => isActive(c.href))
            return (
              <div key={item.label} className="group/menu relative">
                <button
                  className={cn('w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors',
                    anyActive ? 'text-white' : 'text-white/50 group-hover/menu:text-white/80')}>
                  <span className="flex items-center gap-3"><item.icon size={15} />{item.label}</span>
                  <ChevronRight size={12} className="transition-transform duration-200 group-hover/menu:rotate-90" />
                </button>
                <div className="ml-7 mt-0.5 space-y-0.5 max-h-0 overflow-hidden group-hover/menu:max-h-96 transition-[max-height] duration-200 ease-in-out">
                  {item.children.map(child => {
                    const active = isActive(child.href)
                    return (
                      <Link key={child.href} href={`${base}${child.href}`} onClick={onClose}
                        className={cn('block px-3 py-1.5 rounded-md text-sm transition-all',
                          active
                            ? 'text-white font-medium bg-[#2ecc71]/10 border-l-2 border-[#2ecc71] pl-[10px]'
                            : 'text-white/40 hover:text-white/70 hover:bg-white/5')}>
                        {child.label}
                      </Link>
                    )
                  })}
                </div>
              </div>
            )
          }
          const active = isActive((item as any).href ?? '')
          return (
            <Link key={item.label} href={`${base}${(item as any).href ?? ''}`} onClick={onClose}
              className={cn('flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all',
                active
                  ? 'text-white font-medium bg-[#2ecc71]/10 border-l-2 border-[#2ecc71] pl-[10px]'
                  : 'text-white/50 hover:text-white/80 hover:bg-white/5')}>
              <item.icon size={15} />
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-white/5 p-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-bold"
            style={{ backgroundColor: 'rgba(46,204,113,0.15)', color: '#2ecc71', border: '1px solid rgba(46,204,113,0.25)' }}>
            {initials}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-white/60 truncate">{tenantName}</p>
            <p className="text-[10px] text-white/25">cliente ativo</p>
          </div>
        </div>
      </div>
    </aside>
  )
}