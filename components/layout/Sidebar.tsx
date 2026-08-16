'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BarChart3, Users, Boxes, ShoppingCart, DollarSign,
  ChevronDown, ClipboardList, Factory, CreditCard,
  Search, ClipboardCheck, X, Target, Gift, ShoppingBag, BookOpen,
  PanelLeftClose, PanelLeftOpen, QrCode,
} from 'lucide-react'
import { useUser } from '@clerk/nextjs'
import { useQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { useState, useEffect } from 'react'
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

  // NOME vem do NOSSO cadastro (t_usuario.nome), não do Clerk.
  //
  // Motivo concreto: a conta do Clerk de fabiano.halves02@gmail.com está com
  // o nome de perfil "Sistematiza Suporte" — foi criada assim. Enquanto a tela
  // lia user.fullName, o dono do sistema aparecia como suporte. O cadastro do
  // ERP é a fonte de verdade do nome; o Clerk fica só com a autenticação e a
  // foto.
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
    // Ficha Técnica saiu de dentro de Cadastros: ela não é cadastro de
    // registro, é a receita que liga produto a insumo e alimenta produção,
    // custo e margem. Escondida num submenu, ninguém achava.
    { label: 'Fichas Técnicas', href: '/cadastros/ficha-tecnica', icon: BookOpen },
    ...(config.metasAtivo     ? [{ label: 'Metas & Simulador', href: '/metas',      icon: Target }]        : []),
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

  const allItems: Item[] = [...fixos, ...modulares, ...finais]

  function isActive(href: string) {
    const full = `${base}${href}`
    return href === '' ? pathname === base : pathname.startsWith(full)
  }

  // ── Submenu embutido ──────────────────────────────────────────────────────
  // O grupo abre para baixo, dentro da própria barra. O grupo que contém a
  // rota atual já nasce aberto, para o operador ver onde está.
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
          <div className="flex items-center gap-2 min-w-0">
            <img src="/apple-icon.png" alt="" className="h-7 w-7 flex-shrink-0 rounded object-contain" />
            <div className="flex items-baseline">
              <span className="text-[19px] font-bold text-white tracking-tight">Sistematiza</span>
              <span className="text-[19px] font-bold tracking-tight" style={{ color: '#2ecc71' }}>.ai</span>
            </div>
          </div>
        )}
        <div className="flex items-center gap-1">
          <button
            onClick={alternarRecolhida}
            title={recolhida ? 'Expandir menu' : 'Recolher menu'}
            aria-label={recolhida ? 'Expandir menu' : 'Recolher menu'}
            className="hidden lg:flex items-center justify-center text-white/80 hover:text-white p-1.5 rounded-lg bg-white/5 hover:bg-white/15 border border-white/10 transition-colors">
            {recolhida ? <PanelLeftOpen size={17} strokeWidth={2.25} /> : <PanelLeftClose size={17} strokeWidth={2.25} />}
          </button>
          <button onClick={onClose} className="lg:hidden text-white/70 hover:text-white p-1 rounded">
            <X size={17} strokeWidth={2.25} />
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
          const aberto    = abertos.includes(item.label)

          const classesBase = cn(
            'w-full flex items-center rounded-lg text-sm transition-colors',
            recolhida ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2',
            ativo
              ? 'text-white font-medium bg-[#2ecc71]/10'
              : 'text-white/50 hover:text-white/80 hover:bg-white/5',
            ativo && !recolhida ? 'border-l-2 border-[#2ecc71] pl-[10px]' : ''
          )

          // Grupo (Cadastros, Compras): abre a lista de filhos logo abaixo
          if (temFilhos) {
            return (
              <div key={item.label}>
                <button
                  onClick={() => alternarGrupo(item.label)}
                  title={recolhida ? item.label : undefined}
                  className={classesBase}>
                  <item.icon size={16} className="flex-shrink-0" />
                  {!recolhida && (
                    <>
                      <span className="flex-1 text-left">{item.label}</span>
                      <ChevronDown
                        size={13}
                        className={cn('text-white/30 transition-transform', aberto && 'rotate-180')}
                      />
                    </>
                  )}
                </button>

                {!recolhida && aberto && (
                  <div className="mt-0.5 mb-1 ml-[26px] border-l border-white/10 pl-2 space-y-0.5">
                    {item.children!.map(c => {
                      const filhoAtivo = isActive(c.href)
                      return (
                        <Link
                          key={c.href}
                          href={`${base}${c.href}`}
                          onClick={onClose}
                          className={cn(
                            'block rounded-md px-2 py-1.5 text-[13px] transition-colors',
                            filhoAtivo
                              ? 'text-white font-medium bg-[#2ecc71]/10'
                              : 'text-white/45 hover:text-white/85 hover:bg-white/5'
                          )}>
                          {c.label}
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          }

          return (
            <Link
              key={item.label}
              href={`${base}${item.href ?? ''}`}
              onClick={onClose}
              title={recolhida ? item.label : undefined}
              className={classesBase}>
              <item.icon size={16} className="flex-shrink-0" />
              {!recolhida && item.label}
            </Link>
          )
        })}
      </nav>

      {/* Rodapé — QUEM ESTÁ LOGADO.
          Antes mostrava a razão social do tenant, que é a mesma para todos e
          não responde a pergunta que o rodapé de qualquer software responde:
          "eu sou quem, aqui?". Agora traz nome e foto do usuário; a empresa
          aparece na linha de baixo, menor, como contexto. */}
      <div className={cn('border-t border-white/5', recolhida ? 'p-3' : 'p-4')}>
        <div className={cn('flex items-center gap-3', recolhida && 'justify-center')}>
          {fotoUsuario ? (
            <img
              src={fotoUsuario}
              alt=""
              title={`${nomeUsuario} · ${tenantName}`}
              className="w-8 h-8 rounded-full object-cover flex-shrink-0"
              style={{ border: '1px solid rgba(255,255,255,0.15)' }}
            />
          ) : (
            <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-bold"
              title={`${nomeUsuario} · ${tenantName}`}
              style={{ backgroundColor: 'rgba(46,204,113,0.15)', color: '#2ecc71', border: '1px solid rgba(46,204,113,0.25)' }}>
              {iniciaisUsuario || initials}
            </div>
          )}
          {!recolhida && (
            <div className="min-w-0">
              <p className="text-xs font-semibold text-white/75 truncate">{nomeUsuario}</p>
              <p className="text-[10px] text-white/30 truncate">{tenantName}</p>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}