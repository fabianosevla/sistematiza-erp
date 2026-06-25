'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Menu, Bell, Settings, Moon, Sun, X, LogOut, Upload, ShoppingCart, Code2 } from 'lucide-react'
import { useClerk } from '@clerk/nextjs'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/Toast'
import type { Config } from './ClientShell'

interface Props {
  tenantSlug:      string
  tenantName:      string
  config:          Config
  darkMode:        boolean
  onToggleDarkMode: () => void
  onToggleSidebar:  () => void
  logoBase64:      string | null
}

const MODULOS = [
  { key: 'producaoAtivo',  label: 'Produção',          group: 'Operacional' },
  { key: 'estoqueAtivo',   label: 'Estoque',           group: 'Operacional' },
  { key: 'pedidosAtivo',   label: 'Pedidos',           group: 'Operacional' },
  { key: 'comandasAtivo',  label: 'Comandas',          group: 'Operacional' },
  { key: 'consultasAtivo', label: 'Consultas',         group: 'Gerencial'   },
  { key: 'metasAtivo',     label: 'Metas & Simulador', group: 'Gerencial'   },
  { key: 'planoAcaoAtivo', label: 'Plano de Ação',     group: 'Gerencial'   },
  { key: 'fiscalAtivo',    label: 'Fiscal (NFC-e)',    group: 'Gerencial'   },
  { key: 'contasPagarAtivo',         label: 'Contas a Pagar',   group: 'Financeiro' },
  { key: 'contasReceberAtivo',       label: 'Contas a Receber', group: 'Financeiro' },
  { key: 'conciliacaoBancariaAtivo', label: 'Conciliação OFX',  group: 'Financeiro' },
] as const

export default function Header({
  tenantSlug, tenantName, config, darkMode,
  onToggleDarkMode, onToggleSidebar, logoBase64,
}: Props) {
  const qc          = useQueryClient()
  const { toast }   = useToast()
  const { signOut } = useClerk()

  // Busca o usuário do BANCO (não do Clerk) — garante nome correto
  const { data: meuAcessoRaw } = useQuery({
    queryKey: ['meu-acesso', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/perfis/meu-acesso`)).json(),
    staleTime: 60000,
  })
  const usuarioDB  = meuAcessoRaw?.data
  const nomeUsuario = usuarioDB?.nome ?? ''
  const emailUsuario = usuarioDB?.email ?? ''

  const [showSettings, setShowSettings]   = useState(false)
  const [showNotifs, setShowNotifs]       = useState(false)
  const [showUserMenu, setShowUserMenu]   = useState(false)
  const [localConfig, setLocalConfig]     = useState<Record<string, boolean>>({})
  const [logoPreview, setLogoPreview]     = useState<string | null>(logoBase64)

  const { data: notifsRaw } = useQuery({
    queryKey: ['notificacoes', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/notificacoes`)).json(),
    refetchInterval: 60000,
  })

  const salvarConfigMut = useMutation({
    mutationFn: async (changes: Record<string, any>) => {
      const res = await fetch(`/api/${tenantSlug}/configuracoes`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(changes),
      })
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['configuracoes', tenantSlug] })
      toast('Configuração salva!')
    },
    onError: () => toast('Erro ao salvar.', 'error'),
  })

  const notifs    = Array.isArray(notifsRaw?.data) ? notifsRaw.data : []
  const unread    = notifs.filter((n: any) => !n.lida).length

  function getToggleValue(key: string): boolean {
    if (key in localConfig) return localConfig[key]
    return (config as any)[key] ?? false
  }

  function handleToggle(key: string) {
    const novoValor = !getToggleValue(key)
    setLocalConfig(prev => ({ ...prev, [key]: novoValor }))
    salvarConfigMut.mutate({ [key]: novoValor })
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const base64 = ev.target?.result as string
      setLogoPreview(base64)
      await salvarConfigMut.mutateAsync({ logoBase64: base64 })
    }
    reader.readAsDataURL(file)
  }

  const grupos = [...new Set(MODULOS.map(m => m.group))]

  return (
    <>
      <header className="h-14 bg-white border-b border-gray-100 flex items-center justify-between px-4 flex-shrink-0 z-20">
        <button
          onClick={onToggleSidebar}
          className="lg:hidden p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100"
        >
          <Menu size={20} />
        </button>

        <div className="hidden lg:flex items-center gap-3 ml-2">
          {logoPreview ? (
            <img src={logoPreview} alt="Logo" className="h-7 w-auto object-contain" />
          ) : (
            <div className="flex items-center gap-1.5">
              <Code2 size={16} style={{ color: '#2ecc71' }} />
              <div className="flex items-baseline">
                <span className="text-sm font-bold text-gray-900">sistematiza</span>
                <span className="text-sm font-bold" style={{ color: '#2ecc71' }}>.ai</span>
              </div>
            </div>
          )}
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-1">
          {/* ── Abrir PDV ────────────────────────────────────────────────
              <a href> (não router.push) — navegação completa, evita o bug
              de cache do App Router entre rotas que compartilham [tenant] */}
          <a
            href={`/${tenantSlug}/pdv`}
            className="flex items-center gap-1.5 px-3 py-1.5 mr-1 text-sm font-medium text-gray-600 hover:text-gray-900 rounded-lg hover:bg-gray-100 transition-colors"
            title="Abrir PDV"
          >
            <ShoppingCart size={15} />
            <span className="hidden sm:inline">PDV</span>
          </a>

          <button
            onClick={onToggleDarkMode}
            className="p-2 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
            title={darkMode ? 'Modo claro' : 'Modo escuro'}
          >
            {darkMode ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          <button
            onClick={() => setShowNotifs(p => !p)}
            className="relative p-2 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <Bell size={18} />
            {unread > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center text-white"
                style={{ backgroundColor: '#2ecc71' }}>
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </button>

          {/* Avatar com dropdown de usuário — padrão Notion/Linear/Vercel */}
          <div className="relative ml-1">
            <button
              onClick={() => setShowUserMenu(p => !p)}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-100 transition-colors group"
            >
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0"
                style={{ backgroundColor: '#2ecc71' }}>
                {nomeUsuario ? nomeUsuario.charAt(0).toUpperCase() : '?'}
              </div>
              <div className="hidden sm:flex flex-col items-start">
                <span className="text-xs font-semibold text-gray-800 leading-tight max-w-[110px] truncate">
                  {nomeUsuario || 'Usuário'}
                </span>
                <span className="text-[10px] text-gray-400 leading-tight max-w-[110px] truncate">
                  {tenantName}
                </span>
              </div>
              <svg className="hidden sm:block w-3 h-3 text-gray-400 group-hover:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showUserMenu && (
              <>
                {/* Overlay para fechar */}
                <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
                {/* Dropdown */}
                <div className="absolute right-0 top-full mt-1.5 w-64 bg-white rounded-xl shadow-xl border border-gray-100 z-50 overflow-hidden">
                  {/* Info do usuário */}
                  <div className="px-4 py-3 border-b border-gray-100">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                        style={{ backgroundColor: '#2ecc71' }}>
                        {nomeUsuario ? nomeUsuario.charAt(0).toUpperCase() : '?'}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{nomeUsuario || 'Usuário'}</p>
                        <p className="text-xs text-gray-400 truncate">{emailUsuario}</p>
                      </div>
                    </div>
                  </div>
                  {/* Tenant */}
                  <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50/60">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Empresa</p>
                    <p className="text-xs font-medium text-gray-700 mt-0.5">{tenantName}</p>
                  </div>
                  {/* Ações */}
                  <div className="p-1.5">
                    <button
                      onClick={() => { setShowUserMenu(false); setShowSettings(true) }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors text-left"
                    >
                      <Settings size={14} className="text-gray-400" />
                      Configurações
                    </button>
                    <button
                      onClick={() => { setShowUserMenu(false); signOut() }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors text-left"
                    >
                      <LogOut size={14} />
                      Sair
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {showNotifs && (
        <div className="fixed right-4 top-16 z-50 w-80 bg-white rounded-xl shadow-xl border border-gray-100">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-900">Notificações</p>
            <button onClick={() => setShowNotifs(false)} className="text-gray-400 hover:text-gray-600">
              <X size={16} />
            </button>
          </div>
          <div className="max-h-72 overflow-y-auto">
            {notifs.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">Sem notificações</p>
            ) : notifs.slice(0, 10).map((n: any) => (
              <div key={n.id} className={`px-4 py-3 border-b border-gray-50 ${!n.lida ? 'bg-green-50/50' : ''}`}>
                <p className="text-sm text-gray-900">{n.titulo}</p>
                <p className="text-xs text-gray-400 mt-0.5">{n.mensagem}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-gray-100 flex-shrink-0">
              <div>
                <h2 className="text-lg font-semibold">Configurações</h2>
                <p className="text-xs text-gray-400 mt-0.5">{tenantName}</p>
              </div>
              <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Logo</p>
                <div className="flex items-center gap-4">
                  {logoPreview ? (
                    <img src={logoPreview} alt="Logo" className="h-12 w-auto object-contain rounded-lg border border-gray-100 p-1" />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center">
                      <Upload size={16} className="text-gray-400" />
                    </div>
                  )}
                  <label className="cursor-pointer">
                    <span className="text-sm text-blue-600 hover:text-blue-800 font-medium">
                      {logoPreview ? 'Trocar logo' : 'Enviar logo'}
                    </span>
                    <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                  </label>
                  {logoPreview && (
                    <button
                      onClick={() => { setLogoPreview(null); salvarConfigMut.mutate({ logoBase64: null }) }}
                      className="text-xs text-red-400 hover:text-red-600"
                    >
                      Remover
                    </button>
                  )}
                </div>
              </div>

              {grupos.map(grupo => (
                <div key={grupo}>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{grupo}</p>
                  <div className="space-y-2">
                    {MODULOS.filter(m => m.group === grupo).map(modulo => {
                      const ativo = getToggleValue(modulo.key)
                      return (
                        <div key={modulo.key} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                          <span className="text-sm text-gray-700">{modulo.label}</span>
                          <button
                            onClick={() => handleToggle(modulo.key)}
                            className={`w-10 h-6 rounded-full transition-colors flex items-center px-1 ${ativo ? 'bg-green-500' : 'bg-gray-200'}`}
                          >
                            <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${ativo ? 'translate-x-4' : 'translate-x-0'}`} />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="p-6 border-t border-gray-100 flex-shrink-0">
              <Button onClick={() => setShowSettings(false)} className="w-full">Fechar</Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}