'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createPortal } from 'react-dom'
import {
  BarChart3, Users, Boxes, ShoppingCart, DollarSign,
  ChevronRight, ClipboardList, Factory, CreditCard,
  Search, ClipboardCheck, X, Target, Gift, ShoppingBag,
  PanelLeftClose, PanelLeftOpen,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState, useEffect, useRef } from 'react'
import type { Config } from '@/components/layout/ClientShell'

interface Props {
  tenantSlug: string; tenantName: string; config: Config
  open: boolean; onClose: () => void
}

interface Filho { label: string; href: string }
interface Item  { label: string; href?: string; icon: any; children?: Filho[] }

const LARGURA_ABERTA    = 'w-60'
const LARGURA_RECOLHIDA = 'w-[68px]'

export default function Sidebar({ tenantSlug, tenantName, config, open, onClose }: Props) {
  const pathname = usePathname()
  const base     = `/${tenantSlug}`
  const initials = tenantName.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()

  // Recolhido fica salvo por computador — cada operador escolhe como prefere.
  const [recolhida, setRecolhida] = useState(false)
  useEffect(() => {
    try {
      if (window.localStorage.getItem('sidebar-recolhida') === '1') setRecolhida(true)
    } catch {}
  }, [])
  function alternarRecolhida() {
    setRecolhida(v => {
      const novo = !v
      try { window.localStorage.setItem('sidebar-recolhida', novo ? '1' : '0') } catch {}
      return novo
    })
  }

  // Flags de módulo que não vêm no config do layout — buscadas direto da API.
  const [flags, setFlags] = useState<{ fidelidade: boolean; compras: boolean }>({
    fidelidade: false, compras: true,
  })
  useEffect(() => {
    let vivo = true
    fetch(`/api/${tenantSlug}/configuracoes`)
      .then(r => r.json())
      .then(j => {
        if (!vivo) return
        setFlags({
          fidelidade: j?.data?.fidelidadeAtivo === true,
          // Compras nasce ligado: o módulo já existia sem flag nenhuma
          compras:    j?.data?.comprasAtivo !== false,
        })
      })
      .catch(() => {})
    return () => { vivo = false }
  }, [tenantSlug])

  const fixos: Item[] = [
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

  const modulares: Item[] = [
    ...(config.metasAtivo     ? [{ label: 'Metas & Simulador', href: '/metas',      icon: Target }]        : []),
    ...(config.consultasAtivo ? [{ label: 'Consultas',         href: '/consultas',  icon: Search }]         : []),
    ...(config.pedidosAtivo   ? [{ label: 'Pedidos',           href: '/pedidos',    icon: ClipboardList }]  : []),
    ...(config.planoAcaoAtivo ? [{ label: 'Plano de Ação',     href: '/plano-acao', icon: ClipboardCheck }] : []),
    ...(config.producaoAtivo  ? [{ label: 'Produção',          href: '/producao',   icon: Factory }]        : []),
    ...(config.estoqueAtivo   ? [{ label: 'Estoque',           href: '/estoque',    icon: Boxes }]          : []),
    // Compras: módulo existia em código mas nunca aparecia no menu
    ...(flags.compras ? [{
      label: 'Compras', icon: ShoppingBag,
      children: [
        { label: 'Visão geral',   href: '/compras' },
        { label: 'Compra Rápida', href: '/compras/rapida' },
      ],
    }] : []),
    ...(config.comandasAtivo  ? [{ label: 'Comandas',          href: '/comandas',   icon: CreditCard }]     : []),
    ...(config.fiscalAtivo    ? [{ label: 'Fiscal',            href: '/fiscal',     icon: CreditCard }]     : []),
    ...(flags.fidelidade      ? [{ label: 'Fidelidade',        href: '/fidelidade', icon: Gift }]           : []),
  ]

  const finais: Item[] = [
    { label: 'Vendas',     href: '/vendas',     icon: ShoppingCart },
    { label: 'Financeiro', href: '/financeiro', icon: DollarSign },
  ]

  const allItems: Item[] = [...fixos, ...modulares, ...finais]

  function isActive(href: string) {
    const full = `${base}${href}`
    return href === '' ? pathname === base : pathname.startsWith(full)
  }

  // ── Flyout ────────────────────────────────────────────────────────────────
  // O submenu não fica aberto na barra: aparece flutuando ao lado quando o
  // ponteiro passa no item, e só fecha quando sai do item E do painel.
  const [flyout, setFlyout] = useState<{ item: Item; top: number } | null>(null)
  const timer = useRef<any>(null)

  function abrirFlyout(e: React.MouseEvent, item: Item) {
    clearTimeout(timer.current)
    // Sem filhos e barra aberta: não há submenu a mostrar
    if (!item.children && !recolhida) return
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setFlyout({ item, top: Math.min(r.top, window.innerHeight - 320) })
  }
  function agendarFechar() {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setFlyout(null), 140)
  }
  function cancelarFechar() { clearTimeout(timer.current) }

  const larguraFlyout = recolhida ? 68 : 240

  return (
    <>
      <aside
        onMouseLeave={agendarFechar}
        className={cn(
          'fixed lg:static inset-y-0 left-0 z-40 h-screen flex flex-col flex-shrink-0',
          'transition-[width,transform] duration-200 ease-in-out',
          recolhida ? LARGURA_RECOLHIDA : LARGURA_ABERTA,
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
        style={{ backgroundColor: '#0F1117' }}>

        {/* Cabeçalho */}
        <div className={cn(
          'flex items-center gap-2 pt-5 pb-4 border-b border-white/5',
          recolhida ? 'px-3 justify-center' : 'px-5 justify-between'
        )}>
          {!recolhida && (
            <div className="flex items-baseline">
              <span className="text-[19px] font-bold text-white tracking-tight">sistematiza</span>
              <span className="text-[19px] font-bold tracking-tight" style={{ color: '#2ecc71' }}>.ia</span>
            </div>
          )}
          <div className="flex items-center gap-1">
            <button
              onClick={alternarRecolhida}
              title={recolhida ? 'Expandir menu' : 'Recolher menu'}
              aria-label={recolhida ? 'Expandir menu' : 'Recolher menu'}
              className="hidden lg:flex text-white/30 hover:text-white/70 p-1.5 rounded-lg hover:bg-white/5 transition-colors">
              {recolhida ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            </button>
            <button onClick={onClose} className="lg:hidden text-white/30 hover:text-white/70 p-1 rounded">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Navegação */}
        <nav className="flex-1 py-3 overflow-y-auto space-y-0.5 px-2">
          {allItems.map(item => {
            const temFilhos = !!item.children
            const ativo     = temFilhos
              ? item.children!.some(c => isActive(c.href))
              : isActive(item.href ?? '')

            const classesBase = cn(
              'w-full flex items-center rounded-lg text-sm transition-colors',
              recolhida ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2',
              ativo
                ? 'text-white font-medium bg-[#2ecc71]/10'
                : 'text-white/50 hover:text-white/80 hover:bg-white/5',
              ativo && !recolhida ? 'border-l-2 border-[#2ecc71] pl-[10px]' : ''
            )

            // Grupo (Cadastros, Compras): não navega, só abre o flyout
            if (temFilhos) {
              return (
                <button
                  key={item.label}
                  onMouseEnter={e => abrirFlyout(e, item)}
                  className={classesBase}>
                  <item.icon size={16} className="flex-shrink-0" />
                  {!recolhida && (
                    <>
                      <span className="flex-1 text-left">{item.label}</span>
                      <ChevronRight size={12} className="text-white/30" />
                    </>
                  )}
                </button>
              )
            }

            return (
              <Link
                key={item.label}
                href={`${base}${item.href ?? ''}`}
                onClick={onClose}
                onMouseEnter={e => abrirFlyout(e, item)}
                title={recolhida ? item.label : undefined}
                className={classesBase}>
                <item.icon size={16} className="flex-shrink-0" />
                {!recolhida && item.label}
              </Link>
            )
          })}
        </nav>

        {/* Rodapé */}
        <div className={cn('border-t border-white/5', recolhida ? 'p-3' : 'p-4')}>
          <div className={cn('flex items-center gap-3', recolhida && 'justify-center')}>
            <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-bold"
              title={tenantName}
              style={{ backgroundColor: 'rgba(46,204,113,0.15)', color: '#2ecc71', border: '1px solid rgba(46,204,113,0.25)' }}>
              {initials}
            </div>
            {!recolhida && (
              <div className="min-w-0">
                <p className="text-xs font-semibold text-white/60 truncate">{tenantName}</p>
                <p className="text-[10px] text-white/25">cliente ativo</p>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Painel flutuante — fora da barra para não ser cortado pelo overflow */}
      {flyout && typeof document !== 'undefined' && createPortal(
        <div
          onMouseEnter={cancelarFechar}
          onMouseLeave={agendarFechar}
          className="fixed z-50 hidden lg:block"
          style={{ top: flyout.top, left: larguraFlyout + 6 }}>
          <div className="rounded-xl border border-white/10 shadow-xl py-1.5 min-w-[210px]"
            style={{ backgroundColor: '#171A23' }}>
            <p className="px-3 pt-1 pb-2 text-[10px] font-semibold uppercase tracking-wide text-white/30">
              {flyout.item.label}
            </p>
            {flyout.item.children ? (
              flyout.item.children.map(c => {
                const ativo = isActive(c.href)
                return (
                  <Link
                    key={c.href}
                    href={`${base}${c.href}`}
                    onClick={() => { setFlyout(null); onClose() }}
                    className={cn(
                      'block px-3 py-1.5 text-sm transition-colors',
                      ativo
                        ? 'text-white font-medium bg-[#2ecc71]/10'
                        : 'text-white/55 hover:text-white hover:bg-white/5'
                    )}>
                    {c.label}
                  </Link>
                )
              })
            ) : (
              <Link
                href={`${base}${flyout.item.href ?? ''}`}
                onClick={() => { setFlyout(null); onClose() }}
                className="block px-3 py-1.5 text-sm text-white/55 hover:text-white hover:bg-white/5">
                Abrir
              </Link>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  )
}