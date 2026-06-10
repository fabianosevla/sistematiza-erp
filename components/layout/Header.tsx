'use client'
import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useClerk, useUser } from '@clerk/nextjs'
import {
  Settings, LogOut, X, ToggleLeft, ToggleRight,
  Menu, Search, Bell, AlertTriangle, Info, Moon, Sun,
} from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input }  from '@/components/ui/input'
import { Label }  from '@/components/ui/label'

interface Props {
  tenantName:    string
  tenantSlug:    string
  onMenuToggle:  () => void
  onPaletteOpen: () => void
  darkMode:      boolean
  onToggleDark:  () => void
}

const LABELS: Record<string, string> = {
  'cadastros': 'Cadastros', 'clientes': 'Clientes', 'fornecedores': 'Fornecedores',
  'produtos': 'Produtos', 'insumos': 'Insumos', 'usuarios': 'Usuários',
  'formas-pagamento': 'Formas de Pagamento', 'ficha-tecnica': 'Fichas Técnicas',
  'vendas': 'Vendas', 'financeiro': 'Financeiro', 'estoque': 'Estoque',
  'producao': 'Produção', 'pedidos': 'Pedidos', 'comandas': 'Comandas',
  'fiscal': 'Fiscal', 'consultas': 'Consultas', 'plano-acao': 'Plano de Ação',
  'configuracoes': 'Configurações', 'dominios': 'Domínios', 'metas': 'Metas & Simulador',
}

const MODULOS = [
  { key: 'metasAtivo',     label: 'Metas & Simulador', desc: 'Metas mensais e simulador de receita' },
  { key: 'consultasAtivo', label: 'Consultas',          desc: 'Relatórios e animação de vendas' },
  { key: 'pedidosAtivo',   label: 'Pedidos',            desc: 'Pedidos de fábrica e loja' },
  { key: 'planoAcaoAtivo', label: 'Plano de Ação',      desc: 'Tarefas e ações da equipe' },
  { key: 'producaoAtivo',  label: 'Produção',           desc: 'Grade semanal de produção' },
  { key: 'estoqueAtivo',   label: 'Estoque',            desc: 'Controle de produtos e insumos' },
  { key: 'comandasAtivo',  label: 'Comandas',           desc: 'Pedidos por mesa / comanda' },
  { key: 'fiscalAtivo',    label: 'Fiscal',             desc: 'NFC-e, NF-e, NFS-e (requer Focus NFe)' },
] as const

const FIXOS = ['Dashboard', 'Cadastros', 'Vendas', 'Financeiro']

export default function Header({ tenantName, tenantSlug, onMenuToggle, onPaletteOpen, darkMode, onToggleDark }: Props) {
  const { signOut }   = useClerk()
  const { user }      = useUser()
  const qc            = useQueryClient()
  const pathname      = usePathname()
  const router        = useRouter()
  const [showMenu, setShowMenu]         = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showNotifs, setShowNotifs]     = useState(false)

  // Breadcrumb
  const segments    = pathname.split('/').filter(Boolean)
  const afterTenant = segments.slice(1)
  const crumbs      = afterTenant.map((seg, i) => ({
    label:  LABELS[seg] ?? (isNaN(Number(seg)) ? seg.charAt(0).toUpperCase() + seg.slice(1) : `#${seg}`),
    href:   `/${tenantSlug}/${afterTenant.slice(0, i + 1).join('/')}`,
    isLast: i === afterTenant.length - 1,
  }))

  const { data: configData } = useQuery({
    queryKey: ['configuracoes', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/configuracoes`)).json(),
  })

  const { data: notifsData } = useQuery({
    queryKey: ['notificacoes', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/notificacoes`)).json(),
    refetchInterval: 60000,
  })

  const mut = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch(`/api/${tenantSlug}/configuracoes`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      return res.json()
    },
    onSuccess: () => {
      // router.refresh() faz soft refresh sem acionar o middleware — não causa loop
      qc.invalidateQueries({ queryKey: ['configuracoes', tenantSlug] })
      router.refresh()
    },
  })

  const config    = configData?.data
  const notifs    = Array.isArray(notifsData?.data) ? notifsData.data : []
  const cntAlerts = notifs.filter((n: any) => n.nivel === 'warning').length

  return (
    <>
      <header className="h-14 bg-white border-b border-gray-100 flex items-center justify-between px-4 lg:px-6 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={onMenuToggle}
            className="lg:hidden p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">
            <Menu size={20} />
          </button>
          <nav className="flex items-center gap-1.5 text-sm">
            <Link href={`/${tenantSlug}`} className="text-gray-400 hover:text-gray-700 font-medium transition-colors">
              Início
            </Link>
            {crumbs.map((crumb, i) => (
              <span key={i} className="flex items-center gap-1.5">
                <span className="text-gray-300 text-xs">/</span>
                {crumb.isLast
                  ? <span className="text-gray-900 font-semibold">{crumb.label}</span>
                  : <Link href={crumb.href} className="text-gray-400 hover:text-gray-700 font-medium transition-colors">{crumb.label}</Link>
                }
              </span>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          {/* Ctrl+K */}
          <button onClick={onPaletteOpen}
            className="hidden sm:flex items-center gap-2 px-3 py-1.5 text-sm text-gray-400 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">
            <Search size={14} />
            <span className="text-xs">Buscar</span>
            <kbd className="ml-1 px-1.5 py-0.5 text-[10px] bg-white rounded border border-gray-200">⌘K</kbd>
          </button>

          {/* Dark Mode */}
          <button onClick={onToggleDark}
            className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            title={darkMode ? 'Modo Claro' : 'Modo Escuro'}>
            {darkMode ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          {/* Notificações */}
          <div className="relative">
            <button onClick={() => { setShowNotifs(!showNotifs); setShowMenu(false) }}
              className="relative p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">
              <Bell size={18} />
              {cntAlerts > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {cntAlerts > 9 ? '9+' : cntAlerts}
                </span>
              )}
            </button>
            {showNotifs && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowNotifs(false)} />
                <div className="absolute right-0 top-10 z-20 w-80 bg-white rounded-xl shadow-xl border border-gray-100 py-1 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                    <p className="text-sm font-semibold text-gray-900">Notificações</p>
                    {notifs.length > 0 && (
                      <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium">
                        {notifs.length}
                      </span>
                    )}
                  </div>
                  {notifs.length === 0 ? (
                    <div className="px-4 py-6 text-center">
                      <Bell size={20} className="text-gray-200 mx-auto mb-2" />
                      <p className="text-sm text-gray-400">Nenhuma notificação</p>
                    </div>
                  ) : (
                    <div className="max-h-72 overflow-y-auto divide-y divide-gray-50">
                      {notifs.map((n: any) => (
                        <Link key={n.id} href={`/${tenantSlug}/${n.href}`}
                          onClick={() => setShowNotifs(false)}
                          className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${n.nivel === 'warning' ? 'bg-amber-100' : 'bg-blue-100'}`}>
                            {n.nivel === 'warning'
                              ? <AlertTriangle size={13} className="text-amber-600" />
                              : <Info size={13} className="text-blue-600" />
                            }
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-gray-800">{n.titulo}</p>
                            <p className="text-xs text-gray-500 mt-0.5 truncate">{n.descricao}</p>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          <span className="text-sm text-gray-400 hidden sm:block truncate max-w-40">{tenantName}</span>

          {/* Avatar */}
          <div className="relative">
            <button onClick={() => { setShowMenu(!showMenu); setShowNotifs(false) }}
              className="w-8 h-8 rounded-full bg-gray-900 flex items-center justify-center text-white text-sm font-medium hover:bg-gray-700 transition-colors">
              {user?.firstName?.[0] ?? tenantName[0]}
            </button>
            {showMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
                <div className="absolute right-0 top-10 z-20 w-52 bg-white rounded-xl shadow-lg border border-gray-100 py-1">
                  <div className="px-3 py-2 border-b border-gray-100">
                    <p className="text-sm font-medium text-gray-900">{user?.firstName} {user?.lastName}</p>
                    <p className="text-xs text-gray-400 truncate">{user?.emailAddresses[0]?.emailAddress}</p>
                  </div>
                  <button onClick={() => { setShowMenu(false); setShowSettings(true) }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                    <Settings size={14} /> Configurações
                  </button>
                  <button onClick={() => signOut()}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50">
                    <LogOut size={14} /> Sair
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Modal Configurações */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold">Configurações</h2>
              <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-6">

              {/* Módulos */}
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Módulos do Menu</p>
                <p className="text-xs text-gray-400 mb-3">
                  Desativar remove do menu. Os dados são preservados.
                  <span className="block mt-1 text-blue-500">As alterações aparecem ao navegar para outra página.</span>
                </p>
                {FIXOS.map(nome => (
                  <div key={nome} className="flex items-center justify-between py-2.5 border-b border-gray-50">
                    <div>
                      <p className="text-sm font-medium text-gray-400">{nome}</p>
                      <p className="text-xs text-gray-300">Sempre visível</p>
                    </div>
                    <ToggleRight size={32} className="text-gray-200" />
                  </div>
                ))}
                {MODULOS.map(m => (
                  <div key={m.key} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{m.label}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{m.desc}</p>
                    </div>
                    <button onClick={() => mut.mutate({ [m.key]: !config?.[m.key] })} disabled={mut.isPending}>
                      {config?.[m.key]
                        ? <ToggleRight size={32} className="text-green-500" />
                        : <ToggleLeft  size={32} className="text-gray-300" />
                      }
                    </button>
                  </div>
                ))}
              </div>

              {/* Aparência */}
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">Aparência</p>
                <div className="flex items-center justify-between py-2.5">
                  <div>
                    <p className="text-sm font-medium text-gray-900">Modo Escuro</p>
                    <p className="text-xs text-gray-400 mt-0.5">Alterna entre tema claro e escuro</p>
                  </div>
                  <button onClick={onToggleDark}>
                    {darkMode
                      ? <ToggleRight size={32} className="text-green-500" />
                      : <ToggleLeft  size={32} className="text-gray-300" />
                    }
                  </button>
                </div>
              </div>

              {/* Empresa */}
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">Empresa</p>
                <div className="space-y-3">
                  {[
                    { label: 'Nome da empresa',                   key: 'nomeEmpresa' },
                    { label: 'CNPJ',                              key: 'cnpj' },
                    { label: 'IE Estadual',                       key: 'ieEstadual' },
                    { label: 'UF',                                key: 'uf' },
                    { label: 'Regime Tributário (1=SN,3=LR/LP)', key: 'regimeTributario' },
                    { label: 'Telefone',                          key: 'telefone' },
                    { label: 'Endereço',                          key: 'endereco' },
                  ].map(f => (
                    <div key={f.key}>
                      <Label className="text-xs">{f.label}</Label>
                      <Input
                        defaultValue={config?.[f.key] ?? ''}
                        onBlur={e => mut.mutate({ [f.key]: e.target.value })}
                        className="mt-1 h-8 text-sm"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {config?.fiscalAtivo && (
                <div>
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">Integração Fiscal</p>
                  <div className="space-y-3">
                    <div>
                      <Label className="text-xs">Token Focus NFe</Label>
                      <Input
                        defaultValue={config?.focusNfeToken ?? ''}
                        onBlur={e => mut.mutate({ focusNfeToken: e.target.value })}
                        className="mt-1 h-8 text-sm font-mono"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Ambiente</Label>
                      <select
                        defaultValue={config?.focusNfeAmbiente ?? 'homologacao'}
                        onChange={e => mut.mutate({ focusNfeAmbiente: e.target.value })}
                        className="mt-1 w-full h-8 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none">
                        <option value="homologacao">Homologação</option>
                        <option value="producao">Produção</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="px-6 pb-6">
              <Button className="w-full" onClick={() => setShowSettings(false)}>Fechar</Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}