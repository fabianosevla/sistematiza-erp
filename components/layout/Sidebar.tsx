'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BarChart3, Users, Boxes, ShoppingCart, DollarSign, Store,
  ChevronDown, ClipboardList, Factory, CreditCard,
  Search, ClipboardCheck, X, Target, Gift, ShoppingBag, BookOpen,
  PanelLeftClose, PanelLeftOpen, QrCode, Settings, LogOut, Sun, Moon,
} from 'lucide-react'
import { useUser, useClerk } from '@clerk/nextjs'
import { useQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { useState, useEffect } from 'react'
import type { Config } from '@/components/layout/ClientShell'

/**
 * components/layout/Sidebar.tsx
 *
 * ─── SÓ A SIDEBAR, SEM BARRA SUPERIOR ─────────────────────────────────────────
 *
 * A barra de cima (logo + PDV) saiu por completo — menu é só isto aqui agora,
 * igual à referência que o Fabiano mandou (Kuantum). PDV virou item normal do
 * menu, logo após Dashboard. A logo da EMPRESA (não a nossa) foi para o
 * rodapé, acima de quem está logado — mesma lógica da referência, organização
 * em cima, usuário embaixo.
 *
 * ─── CONFIGURAÇÕES VOLTOU A SER LINK ÚNICO ────────────────────────────────────
 *
 * Chegou a virar grupo com 6 filhos (uma página por seção) — mas 6 itens
 * expandidos não cabiam na sidebar. As 6 seções agora são ABAS dentro da
 * própria página (`ConfiguracoesView`, no padrão de Consultas), então aqui
 * é de novo um `Item` simples, um `href` só. "Modo escuro" não tinha mais
 * onde se aninhar sem o grupo — virou item próprio, sem `href` (não navega,
 * é ação): o mesmo truque de item-vira-botão que os filhos de ação já
 * usavam, só que num item de topo agora.
 *
 * ─── HOVER TAMBÉM FICA VERDE ──────────────────────────────────────────────────
 *
 * Antes só o item ativo ficava verde; passar o mouse só mudava pra cinza.
 * Agora hover usa o mesmo verde do ativo (mais claro), pra dar feedback de
 * "isto é clicável" consistente com o que already significa "você está aqui".
 */

interface Props {
  tenantSlug: string; tenantName: string; config: Config
  open: boolean; onClose: () => void
  darkMode: boolean; onToggleDarkMode: () => void
  logoBase64: string | null
}

interface Filho { label: string; href?: string; onClick?: () => void }
interface Item  { label: string; href?: string; icon: any; children?: Filho[]; onClick?: () => void }

const LARGURA_ABERTA    = 'w-[234px]'
const LARGURA_RECOLHIDA = 'w-[64px]'

// Classes de hover reaproveitadas nos três níveis (item de topo, grupo,
// filho de submenu) — mesmo verde do estado ativo, mais claro.
const HOVER = 'hover:bg-green-50 hover:text-green-800 dark:hover:bg-[#2ecc71]/10 dark:hover:text-white'

export default function Sidebar({ tenantSlug, tenantName, config, open, onClose, darkMode, onToggleDarkMode, logoBase64 }: Props) {
  const pathname = usePathname()
  const base     = `/${tenantSlug}`
  const initials = tenantName.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
  const { signOut } = useClerk()

  // NOME vem do NOSSO cadastro (t_usuario.nome), não do Clerk.
  const { user } = useUser()
  const { data: meuAcesso } = useQuery({
    queryKey: ['meu-acesso', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/perfis/meu-acesso`)).json(),
    staleTime: 60000,
  })
  const nomeUsuario =
    String(meuAcesso?.data?.nome ?? '').trim() ||
    user?.fullName?.trim() ||
    user?.primaryEmailAddress?.emailAddress ||
    'Usuário'
  const fotoUsuario     = user?.hasImage ? user.imageUrl : ''
  const iniciaisUsuario = nomeUsuario
    .split(' ').filter(Boolean).slice(0, 2)
    .map(w => w[0]).join('').toUpperCase()

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

  // Todas as flags vêm do `config` montado no tenant-layout. Não há fetch
  // aqui: o menu tem que existir já na primeira pintura, senão pisca.
  const fixos: Item[] = [
    { label: 'Dashboard', href: '', icon: BarChart3 },
    { label: 'PDV', href: '/pdv', icon: Store },
    {
      label: 'Cadastros', icon: Users,
      children: [
        { label: 'Clientes',          href: '/cadastros/clientes' },
        { label: 'Fornecedores',      href: '/cadastros/fornecedores' },
        { label: 'Produtos',          href: '/cadastros/produtos' },
        { label: 'Insumos',           href: '/cadastros/insumos' },
        { label: 'Formas Pagamento',  href: '/cadastros/formas-pagamento' },
        { label: 'Usuários',          href: '/cadastros/usuarios' },
        { label: 'Perfis de Acesso',  href: '/perfis' },
        { label: 'Domínios',          href: '/cadastros/dominios' },
      ],
    },
  ]

  const modulares: Item[] = [
    { label: 'Fichas Técnicas', href: '/cadastros/ficha-tecnica', icon: BookOpen },
    ...(config.metasAtivo ? [{
      label: 'Metas & Simulador', icon: Target,
      children: [
        { label: 'Metas',                href: '/metas' },
        { label: 'Simulador',            href: '/metas/simulador' },
        { label: 'Previsão de Produção', href: '/metas/previsao' },
        { label: 'Evolução',             href: '/metas/evolucao' },
      ],
    }] : []),
    ...(config.cardapioAtivo  ? [{ label: 'Cardápio Digital',  href: '/cardapio-digital', icon: QrCode }]  : []),
    ...(config.consultasAtivo ? [{ label: 'Consultas',         href: '/consultas',  icon: Search }]         : []),
    ...(config.pedidosAtivo   ? [{ label: 'Pedidos',           href: '/pedidos',    icon: ClipboardList }]  : []),
    ...(config.planoAcaoAtivo ? [{ label: 'Plano de Ação',     href: '/plano-acao', icon: ClipboardCheck }] : []),
    ...(config.producaoAtivo  ? [{ label: 'Produção',          href: '/producao',   icon: Factory }]        : []),
    ...(config.estoqueAtivo   ? [{ label: 'Estoque',           href: '/estoque',    icon: Boxes }]          : []),
    ...(config.comprasAtivo ? [{
      label: 'Compras', href: '/compras', icon: ShoppingBag,
    }] : []),
    ...(config.fiscalAtivo     ? [{ label: 'Fiscal',      href: '/fiscal',     icon: CreditCard }] : []),
    ...(config.fidelidadeAtivo ? [{ label: 'Fidelidade',  href: '/fidelidade', icon: Gift }]       : []),
  ]

  const finais: Item[] = [
    ...(config.vendasAtivo     ? [{ label: 'Vendas',     href: '/vendas',     icon: ShoppingCart }] : []),
    ...(config.financeiroAtivo ? [{ label: 'Financeiro', href: '/financeiro', icon: DollarSign }]   : []),
  ]

  // Configurações — sempre visível, não depende de flag de módulo, é conta.
  // Link único de novo: as 6 seções viraram abas DENTRO da página
  // (ConfiguracoesView, no padrão de Consultas) — um submenu de 6 itens
  // expandido não cabia na sidebar. "Modo escuro" não tem mais onde se
  // aninhar (Configurações não é mais grupo), então vira item próprio, sem
  // link — é ação, não navegação.
  const conta: Item[] = [
    { label: 'Configurações', href: '/configuracoes', icon: Settings },
    { label: darkMode ? 'Modo claro' : 'Modo escuro', icon: darkMode ? Sun : Moon, onClick: onToggleDarkMode },
  ]

  const allItems: Item[] = [...fixos, ...modulares, ...finais, ...conta]

  function isActive(href?: string) {
    if (!href) return false
    const full = `${base}${href}`
    return href === '' ? pathname === base : pathname.startsWith(full)
  }

  // ── Submenu embutido ──────────────────────────────────────────────────────
  const [abertos, setAbertos] = useState<string[]>([])

  useEffect(() => {
    const doAtivo = allItems.find(i => i.children?.some(c => isActive(c.href)))
    if (doAtivo) setAbertos(a => (a.includes(doAtivo.label) ? a : [...a, doAtivo.label]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, config.comprasAtivo])

  function alternarGrupo(label: string) {
    // Com a barra recolhida não há espaço para o submenu: expande a barra
    // e já abre o grupo clicado.
    if (recolhida) {
      setRecolhida(false)
      try { window.localStorage.setItem('sidebar-recolhida', '0') } catch {}
      setAbertos(a => (a.includes(label) ? a : [...a, label]))
      return
    }
    setAbertos(a => (a.includes(label) ? a.filter(x => x !== label) : [...a, label]))
  }

  return (
    <aside
      className={cn(
        'fixed lg:static inset-y-0 left-0 z-40 h-screen flex flex-col flex-shrink-0',
        'bg-gray-100 dark:bg-[#0F1117] border-r border-gray-200 dark:border-white/5',
        'transition-[width,transform] duration-200 ease-in-out',
        recolhida ? LARGURA_RECOLHIDA : LARGURA_ABERTA,
        open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      )}>

      {/* Cabeçalho — marca do Sistematiza (a nossa, não a da empresa cliente) */}
      <div className={cn(
        'flex items-center gap-2 pt-[18px] pb-4',
        recolhida ? 'px-3 justify-center' : 'px-4 justify-between'
      )}>
        {!recolhida && (
          <div className="flex items-center gap-2.5 min-w-0">
            <img src="/apple-icon.png" alt="" className="h-6 w-6 flex-shrink-0 rounded-md object-contain" />
            <div className="flex items-baseline">
              <span className="text-[15.5px] font-semibold tracking-tight text-gray-900 dark:text-white">Sistematiza</span>
              <span className="text-[15.5px] font-semibold tracking-tight text-green-600">.ai</span>
            </div>
          </div>
        )}
        <div className="flex items-center gap-1">
          <button
            onClick={alternarRecolhida}
            title={recolhida ? 'Expandir menu' : 'Recolher menu'}
            aria-label={recolhida ? 'Expandir menu' : 'Recolher menu'}
            className="hidden lg:flex items-center justify-center h-[26px] w-[26px] rounded-lg text-gray-500 hover:text-gray-900 bg-white hover:bg-gray-100 border border-gray-200 transition-colors dark:bg-white/5 dark:border-white/10 dark:text-white/70 dark:hover:text-white">
            {recolhida ? <PanelLeftOpen size={15} strokeWidth={2} /> : <PanelLeftClose size={15} strokeWidth={2} />}
          </button>
          <button onClick={onClose} className="lg:hidden text-gray-400 hover:text-gray-900 p-1 rounded-lg">
            <X size={16} strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* Navegação */}
      <nav className="flex-1 pb-3 overflow-y-auto space-y-px px-2.5">
        {allItems.map(item => {
          const temFilhos = !!item.children
          const ativo     = temFilhos
            ? item.children!.some(c => isActive(c.href))
            : item.href !== undefined && isActive(item.href)
          const aberto    = abertos.includes(item.label)

          const classesBase = cn(
            'group w-full flex items-center rounded-lg text-[13.5px] transition-colors',
            recolhida ? 'justify-center px-0 py-2.5' : 'gap-[11px] px-2.5 py-[7px]',
            ativo
              ? 'bg-green-50 text-green-800 font-medium dark:bg-[#2ecc71]/10 dark:text-white'
              : cn('text-gray-700 dark:text-white/50', HOVER)
          )
          const iconClasses = cn(
            'flex-shrink-0 transition-colors',
            ativo ? 'text-green-600' : 'text-gray-400 group-hover:text-green-600 dark:group-hover:text-white'
          )

          // Grupo (Cadastros, Metas, Configurações): abre a lista de filhos
          // logo abaixo — mesmo mecanismo pros três, nenhum tratamento
          // especial por item.
          if (temFilhos) {
            return (
              <div key={item.label}>
                <button
                  onClick={() => alternarGrupo(item.label)}
                  title={recolhida ? item.label : undefined}
                  className={classesBase}>
                  <item.icon size={15} strokeWidth={1.9} className={iconClasses} />
                  {!recolhida && (
                    <>
                      <span className="flex-1 text-left">{item.label}</span>
                      <ChevronDown
                        size={12}
                        strokeWidth={2.2}
                        className={cn('text-gray-300 transition-transform', aberto && 'rotate-180')}
                      />
                    </>
                  )}
                </button>

                {!recolhida && aberto && (
                  <div className="mt-px mb-1.5 ml-[25px] border-l border-gray-200 dark:border-white/10 pl-2.5 space-y-px">
                    {item.children!.map(c => {
                      const filhoAtivo = isActive(c.href)
                      const filhoClasses = cn(
                        'block w-full text-left rounded-md px-2 py-1.5 text-[13px] transition-colors',
                        filhoAtivo
                          ? 'bg-green-50 text-green-800 font-medium dark:bg-[#2ecc71]/10 dark:text-white'
                          : cn('text-gray-600 dark:text-white/45', HOVER)
                      )
                      // "Modo escuro" e qualquer outro filho de ação (sem
                      // href) vira botão; o resto é link de verdade.
                      if (!c.href) {
                        return (
                          <button key={c.label} onClick={c.onClick} className={filhoClasses}>
                            {c.label}
                          </button>
                        )
                      }
                      return (
                        <Link
                          key={c.href}
                          href={`${base}${c.href}`}
                          onClick={onClose}
                          className={filhoClasses}>
                          {c.label}
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          }

          // Item de ação (Modo escuro): sem href, não navega — vira botão.
          if (item.href === undefined) {
            return (
              <button
                key={item.label}
                onClick={item.onClick}
                title={recolhida ? item.label : undefined}
                className={classesBase}>
                <item.icon size={15} strokeWidth={1.9} className={iconClasses} />
                {!recolhida && item.label}
              </button>
            )
          }

          return (
            <Link
              key={item.label}
              href={`${base}${item.href}`}
              onClick={onClose}
              title={recolhida ? item.label : undefined}
              className={classesBase}>
              <item.icon size={15} strokeWidth={1.9} className={iconClasses} />
              {!recolhida && item.label}
            </Link>
          )
        })}
      </nav>

      {/* Rodapé — organização em cima (logo + nome), usuário logado embaixo
          com Sair ao lado. Mesma ordem da referência: conta antes de
          pessoa. */}
      <div className={cn('border-t border-gray-200 dark:border-white/5', recolhida ? 'p-3' : 'px-4 py-3')}>
        <div className={cn('flex items-center gap-2.5 pb-2.5 mb-2.5 border-b border-gray-200/70 dark:border-white/5', recolhida && 'flex-col')}>
          {logoBase64 ? (
            <img
              src={logoBase64}
              alt=""
              title={tenantName}
              className="w-7 h-7 rounded-lg object-contain flex-shrink-0 bg-white border border-gray-200"
            />
          ) : (
            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-[10.5px] font-semibold bg-white text-gray-500 border border-gray-200"
              title={tenantName}>
              {initials}
            </div>
          )}
          {!recolhida && (
            <div className="min-w-0">
              <p className="text-[12.5px] font-medium text-gray-900 dark:text-white/75 truncate">{tenantName}</p>
              <p className="text-[11px] text-gray-400 dark:text-white/30 truncate">Organização</p>
            </div>
          )}
        </div>

        <div className={cn('flex items-center gap-2.5', recolhida ? 'flex-col' : 'justify-between')}>
          <div className={cn('flex items-center gap-2.5 min-w-0', recolhida && 'flex-col')}>
            {fotoUsuario ? (
              <img
                src={fotoUsuario}
                alt=""
                title={nomeUsuario}
                className="w-7 h-7 rounded-full object-cover flex-shrink-0 border border-gray-200"
              />
            ) : (
              <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[10.5px] font-semibold bg-green-50 text-green-800 border border-green-100"
                title={nomeUsuario}>
                {iniciaisUsuario || initials}
              </div>
            )}
            {!recolhida && (
              <div className="min-w-0">
                <p className="text-[12.5px] font-medium text-gray-900 dark:text-white/75 truncate">{nomeUsuario}</p>
              </div>
            )}
          </div>
          <button
            onClick={() => signOut({ redirectUrl: '/sign-in' })}
            title="Sair"
            className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:text-white/40 dark:hover:text-red-400 dark:hover:bg-white/5 transition-colors"
          >
            <LogOut size={15} strokeWidth={1.9} />
          </button>
        </div>
      </div>
    </aside>
  )
}
