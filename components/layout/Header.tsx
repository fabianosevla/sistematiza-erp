'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useClerk, useUser } from '@clerk/nextjs'
import { Settings, LogOut, X, ToggleLeft, ToggleRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface Props { tenantName: string; tenantSlug: string }

const MODULOS = [
  { key: 'producaoAtivo',  label: 'Produção',  desc: 'Grade semanal de produção' },
  { key: 'estoqueAtivo',   label: 'Estoque',   desc: 'Controle de estoque' },
  { key: 'vendasAtivo',    label: 'Vendas',    desc: 'Registro de vendas' },
  { key: 'fiscalAtivo',    label: 'Fiscal',    desc: 'NFC-e, NF-e, NFS-e (requer Focus NFe)' },
  { key: 'comandasAtivo',  label: 'Comandas',  desc: 'Pedidos por mesa' },
] as const

export default function Header({ tenantName, tenantSlug }: Props) {
  const { signOut } = useClerk()
  const { user }    = useUser()
  const qc          = useQueryClient()
  const [showMenu, setShowMenu]         = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  const { data } = useQuery({
    queryKey: ['configuracoes', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/configuracoes`)).json(),
  })

  const mut = useMutation({
    mutationFn: async (payload: any) => {
      await fetch(`/api/${tenantSlug}/configuracoes`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['configuracoes', tenantSlug] }),
  })

  const config = data?.data

  return (
    <>
      <header className="h-14 bg-white border-b border-gray-100 flex items-center justify-between px-6 flex-shrink-0">
        <div />
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-400 hidden sm:block">{tenantName}</span>
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="w-8 h-8 rounded-full bg-gray-900 flex items-center justify-center text-white text-sm font-medium hover:bg-gray-700 transition-colors"
            >
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

      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">Configurações</h2>
              <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-6">
              {/* Módulos */}
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">Módulos</p>
                {MODULOS.map(m => (
                  <div key={m.key} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{m.label}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{m.desc}</p>
                    </div>
                    <button onClick={() => mut.mutate({ [m.key]: !config?.[m.key] })} disabled={mut.isPending}>
                      {config?.[m.key]
                        ? <ToggleRight size={32} className="text-green-500" />
                        : <ToggleLeft size={32} className="text-gray-300" />
                      }
                    </button>
                  </div>
                ))}
              </div>

              {/* Empresa */}
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">Empresa</p>
                <div className="space-y-3">
                  {[
                    { label: 'Nome da empresa', key: 'nomeEmpresa' },
                    { label: 'CNPJ',            key: 'cnpj' },
                    { label: 'IE Estadual',      key: 'ieEstadual' },
                    { label: 'UF',               key: 'uf' },
                    { label: 'Regime Tributário (1=SN, 3=LR/LP)', key: 'regimeTributario' },
                    { label: 'Telefone',         key: 'telefone' },
                    { label: 'Endereço',         key: 'endereco' },
                  ].map(f => (
                    <div key={f.key}>
                      <Label className="text-xs">{f.label}</Label>
                      <Input defaultValue={config?.[f.key] ?? ''} onBlur={e => mut.mutate({ [f.key]: e.target.value })} className="mt-1 h-8 text-sm" />
                    </div>
                  ))}
                </div>
              </div>

              {/* Focus NFe */}
              {config?.fiscalAtivo && (
                <div>
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">Integração Fiscal (Focus NFe)</p>
                  <div className="space-y-3">
                    <div>
                      <Label className="text-xs">Token Focus NFe</Label>
                      <Input defaultValue={config?.focusNfeToken ?? ''} onBlur={e => mut.mutate({ focusNfeToken: e.target.value })} className="mt-1 h-8 text-sm font-mono" placeholder="seu_token_aqui" />
                    </div>
                    <div>
                      <Label className="text-xs">Ambiente</Label>
                      <select defaultValue={config?.focusNfeAmbiente ?? 'homologacao'}
                        onChange={e => mut.mutate({ focusNfeAmbiente: e.target.value })}
                        className="mt-1 w-full h-8 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none">
                        <option value="homologacao">Homologação (testes)</option>
                        <option value="producao">Produção</option>
                      </select>
                    </div>
                    <p className="text-xs text-amber-600 bg-amber-50 rounded-lg p-3">
                      Acesse <strong>focusnfe.com.br</strong> para criar sua conta e obter o token de integração com a SEFAZ.
                    </p>
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