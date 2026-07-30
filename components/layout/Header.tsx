'use client'
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Menu, Bell, Settings, Moon, Sun, X, LogOut, Upload, Store } from 'lucide-react'
import { useClerk } from '@clerk/nextjs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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

// Módulos toggleáveis no painel de configurações.
//
// REGRA: todo item que aparece no menu lateral tem que estar nesta lista.
// Ao acrescentar um menu no Sidebar, acrescente a chave aqui também — senão
// o cliente não consegue desligá-lo.
//
// Duas exceções propositais: Dashboard e Cadastros. O Dashboard é a rota raiz
// do tenant e sem Cadastros ninguém cria produto nem cliente — esconder
// qualquer um dos dois deixaria o sistema inutilizável.
const MODULOS = [
  // Menus que antes não tinham chave nenhuma
  { key: 'vendasAtivo',     label: 'Vendas',            group: 'Menus principais' },
  { key: 'financeiroAtivo', label: 'Financeiro',        group: 'Menus principais' },

  { key: 'producaoAtivo',  label: 'Produção',          group: 'Operacional' },
  { key: 'estoqueAtivo',   label: 'Estoque',           group: 'Operacional' },
  { key: 'comprasAtivo',   label: 'Compras',           group: 'Operacional' },
  { key: 'pedidosAtivo',   label: 'Pedidos',           group: 'Operacional' },
  { key: 'comandasAtivo',  label: 'Comandas',          group: 'Operacional' },

  { key: 'consultasAtivo', label: 'Consultas',         group: 'Gerencial'   },
  { key: 'metasAtivo',     label: 'Metas & Simulador', group: 'Gerencial'   },
  { key: 'fidelidadeAtivo',label: 'Fidelidade',        group: 'Gerencial'   },
  { key: 'planoAcaoAtivo', label: 'Plano de Ação',     group: 'Gerencial'   },
  { key: 'fiscalAtivo',    label: 'Fiscal (NFC-e)',    group: 'Gerencial'   },

  // Financeiro Completo
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

  const [showSettings, setShowSettings]   = useState(false)
  const [showNotifs, setShowNotifs]       = useState(false)
  const [localConfig, setLocalConfig]     = useState<Record<string, boolean>>({})
  const [logoPreview, setLogoPreview]     = useState<string | null>(logoBase64)
  // Dados cadastrais da empresa. Cada cliente que compra a ferramenta informa
  // os seus aqui; é o que alimenta o cabeçalho do cupom e dos documentos.
  const [empresa, setEmpresa]             = useState<Record<string, string>>({})
  const [empresaTocada, setEmpresaTocada] = useState(false)

  // Estado real das flags via API. Serve de baseline dos toggles.
  const { data: configApiRaw } = useQuery({
    queryKey: ['configuracoes', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/configuracoes`)).json(),
  })
  const configApi = configApiRaw?.data

  // Carrega os dados da empresa uma vez, sem sobrescrever o que está sendo
  // digitado — por isso o guarda `empresaTocada`.
  useEffect(() => {
    if (!configApi || empresaTocada) return
    setEmpresa({
      nomeEmpresa:        configApi.nomeEmpresa        ?? '',
      nomeFantasia:       configApi.nomeFantasia       ?? '',
      cnpj:               configApi.cnpj               ?? '',
      inscricaoEstadual:  configApi.inscricaoEstadual  ?? '',
      inscricaoMunicipal: configApi.inscricaoMunicipal ?? '',
      telefone:           configApi.telefone           ?? '',
      email:              configApi.email              ?? '',
      cep:                configApi.cep                ?? '',
      endereco:           configApi.endereco           ?? '',
      numero:             configApi.numero             ?? '',
      complemento:        configApi.complemento        ?? '',
      bairro:             configApi.bairro             ?? '',
      cidade:             configApi.cidade             ?? '',
      uf:                 configApi.uf                 ?? '',
      mensagemCupom:      configApi.mensagemCupom      ?? '',
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configApi])

  const setEmp = (k: string, v: string) => {
    setEmpresaTocada(true)
    setEmpresa(p => ({ ...p, [k]: v }))
  }

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
      // O menu lateral é montado no servidor a partir do tenant-layout.
      // Sem este refresh, a chave só apareceria no menu no próximo F5.
      if (typeof window !== 'undefined') {
        setTimeout(() => window.location.reload(), 400)
      }
    },
    onError: () => toast('Erro ao salvar.', 'error'),
  })

  // Salvar dados da empresa é uma ação explícita, com botão. Diferente dos
  // toggles de módulo, aqui não faz sentido gravar a cada tecla nem recarregar
  // a página — o menu lateral não depende destes campos.
  const salvarEmpresaMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/${tenantSlug}/configuracoes`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(empresa),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d?.message ?? 'Erro ao salvar')
      return d
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['configuracoes', tenantSlug] })
      setEmpresaTocada(false)
      toast('Dados da empresa salvos!')
    },
    onError: () => toast('Erro ao salvar os dados da empresa.', 'error'),
  })

  const notifs    = Array.isArray(notifsRaw?.data) ? notifsRaw.data : []
  const unread    = notifs.filter((n: any) => !n.lida).length

  function getToggleValue(key: string): boolean {
    if (key in localConfig) return localConfig[key]
    if (configApi && configApi[key] !== undefined) return !!configApi[key]
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

  // Agrupar módulos por grupo
  const grupos = [...new Set(MODULOS.map(m => m.group))]

  return (
    <>
      <header className="h-14 bg-white border-b border-gray-100 flex items-center justify-between px-4 flex-shrink-0 z-20">
        {/* Botão hamburger (mobile) */}
        <button
          onClick={onToggleSidebar}
          className="lg:hidden p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100"
        >
          <Menu size={20} />
        </button>

        {/* Logo / Nome */}
        <div className="hidden lg:flex items-center gap-3 ml-2">
          {logoPreview ? (
            <img src={logoPreview} alt="Logo" className="h-7 w-auto object-contain" />
          ) : (
            <div className="flex items-baseline">
              <span className="text-sm font-bold text-gray-900">sistematiza</span>
              <span className="text-sm font-bold" style={{ color: '#2ecc71' }}>.ia</span>
            </div>
          )}
        </div>

        <div className="flex-1" />

        {/* Ações */}
        <div className="flex items-center gap-1">
          {/* Atalho PDV (ambiente separado) — disponível para todos. */}
          <a
            href={`/${tenantSlug}/pdv`}
            className="flex items-center gap-1.5 px-3 py-1.5 mr-1 rounded-lg text-sm font-medium text-white transition-colors"
            style={{ backgroundColor: '#2ecc71' }}
            title="Abrir PDV"
          >
            <Store size={16} /> PDV
          </a>

          {/* Dark mode */}
          <button
            onClick={onToggleDarkMode}
            className="p-2 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
            title={darkMode ? 'Modo claro' : 'Modo escuro'}
          >
            {darkMode ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          {/* Notificações */}
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

          {/* Configurações */}
          <button
            onClick={() => setShowSettings(true)}
            className="p-2 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <Settings size={18} />
          </button>

          {/* Sair */}
          <button
            onClick={() => signOut()}
            className="p-2 text-gray-400 hover:text-red-500 rounded-lg hover:bg-gray-100 transition-colors"
            title="Sair"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* Dropdown notificações */}
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

      {/* Modal configurações */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col">
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
              {/* Dados da empresa — cabeçalho de cupom e documentos */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Dados da empresa</p>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Razão social</Label>
                      <Input value={empresa.nomeEmpresa ?? ''} onChange={e => setEmp('nomeEmpresa', e.target.value)}
                        className="mt-1 h-9 text-sm" placeholder="Nome registrado" />
                    </div>
                    <div>
                      <Label className="text-xs">Nome fantasia</Label>
                      <Input value={empresa.nomeFantasia ?? ''} onChange={e => setEmp('nomeFantasia', e.target.value)}
                        className="mt-1 h-9 text-sm" placeholder="Nome conhecido" />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label className="text-xs">CNPJ</Label>
                      <Input value={empresa.cnpj ?? ''} onChange={e => setEmp('cnpj', e.target.value)}
                        className="mt-1 h-9 text-sm" placeholder="00.000.000/0000-00" />
                    </div>
                    <div>
                      <Label className="text-xs">Inscrição estadual</Label>
                      <Input value={empresa.inscricaoEstadual ?? ''} onChange={e => setEmp('inscricaoEstadual', e.target.value)}
                        className="mt-1 h-9 text-sm" placeholder="Isento, se não tiver" />
                    </div>
                    <div>
                      <Label className="text-xs">Inscrição municipal</Label>
                      <Input value={empresa.inscricaoMunicipal ?? ''} onChange={e => setEmp('inscricaoMunicipal', e.target.value)}
                        className="mt-1 h-9 text-sm" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Telefone</Label>
                      <Input value={empresa.telefone ?? ''} onChange={e => setEmp('telefone', e.target.value)}
                        className="mt-1 h-9 text-sm" placeholder="(00) 0000-0000" />
                    </div>
                    <div>
                      <Label className="text-xs">E-mail</Label>
                      <Input type="email" value={empresa.email ?? ''} onChange={e => setEmp('email', e.target.value)}
                        className="mt-1 h-9 text-sm" placeholder="contato@empresa.com" />
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-3">
                    <div>
                      <Label className="text-xs">CEP</Label>
                      <Input value={empresa.cep ?? ''} onChange={e => setEmp('cep', e.target.value)}
                        className="mt-1 h-9 text-sm" placeholder="00000-000" />
                    </div>
                    <div className="col-span-3">
                      <Label className="text-xs">Endereço</Label>
                      <Input value={empresa.endereco ?? ''} onChange={e => setEmp('endereco', e.target.value)}
                        className="mt-1 h-9 text-sm" placeholder="Rua, avenida…" />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label className="text-xs">Número</Label>
                      <Input value={empresa.numero ?? ''} onChange={e => setEmp('numero', e.target.value)}
                        className="mt-1 h-9 text-sm" />
                    </div>
                    <div>
                      <Label className="text-xs">Complemento</Label>
                      <Input value={empresa.complemento ?? ''} onChange={e => setEmp('complemento', e.target.value)}
                        className="mt-1 h-9 text-sm" />
                    </div>
                    <div>
                      <Label className="text-xs">Bairro</Label>
                      <Input value={empresa.bairro ?? ''} onChange={e => setEmp('bairro', e.target.value)}
                        className="mt-1 h-9 text-sm" />
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-3">
                    <div className="col-span-3">
                      <Label className="text-xs">Cidade</Label>
                      <Input value={empresa.cidade ?? ''} onChange={e => setEmp('cidade', e.target.value)}
                        className="mt-1 h-9 text-sm" />
                    </div>
                    <div>
                      <Label className="text-xs">UF</Label>
                      <Input maxLength={2} value={empresa.uf ?? ''} onChange={e => setEmp('uf', e.target.value.toUpperCase())}
                        className="mt-1 h-9 text-sm" />
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs">Mensagem do cupom</Label>
                    <Input value={empresa.mensagemCupom ?? ''} onChange={e => setEmp('mensagemCupom', e.target.value)}
                      className="mt-1 h-9 text-sm" placeholder="Obrigado pela preferência!" />
                  </div>

                  <div className="flex justify-end">
                    <Button size="sm" onClick={() => salvarEmpresaMut.mutate()}
                      disabled={!empresaTocada || salvarEmpresaMut.isPending}>
                      {salvarEmpresaMut.isPending ? 'Salvando...' : 'Salvar dados'}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Logo */}
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

              {/* Módulos por grupo */}
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