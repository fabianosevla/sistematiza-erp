'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useClerk } from '@clerk/nextjs'
import { useUser } from '@clerk/nextjs'
import { Settings, LogOut, X, ToggleLeft, ToggleRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface HeaderProps {
  tenantName: string
  tenantSlug: string
}

export default function Header({ tenantName, tenantSlug }: HeaderProps) {
  const { signOut } = useClerk()
  const { user }    = useUser()
  const queryClient = useQueryClient()
  const [showMenu, setShowMenu]         = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  const { data } = useQuery({
    queryKey: ['configuracoes', tenantSlug],
    queryFn: async () => {
      const res = await fetch(`/api/${tenantSlug}/configuracoes`)
      return res.json()
    },
  })

  const updateMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch(`/api/${tenantSlug}/configuracoes`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['configuracoes', tenantSlug] })
    },
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
                  <button
                    onClick={() => { setShowMenu(false); setShowSettings(true) }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <Settings size={14} />
                    Configurações
                  </button>
                  <button
                    onClick={() => signOut()}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <LogOut size={14} />
                    Sair
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Modal de Configurações */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">Configurações</h2>
              <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Módulos */}
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">Módulos</p>
                <div className="flex items-center justify-between py-3 border-b border-gray-100">
                  <div>
                    <p className="text-sm font-medium text-gray-900">Comandas</p>
                    <p className="text-xs text-gray-400 mt-0.5">Habilita pedidos por mesa para consumo no local</p>
                  </div>
                  <button
                    onClick={() => updateMutation.mutate({ comandasAtivo: !config?.comandasAtivo })}
                    disabled={updateMutation.isPending}
                    className="text-gray-400 hover:text-green-600 transition-colors"
                  >
                    {config?.comandasAtivo
                      ? <ToggleRight size={32} className="text-green-500" />
                      : <ToggleLeft size={32} className="text-gray-300" />
                    }
                  </button>
                </div>
              </div>

              {/* Empresa */}
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">Empresa</p>
                <div className="space-y-3">
                  {[
                    { label: 'Nome da empresa', key: 'nomeEmpresa', value: config?.nomeEmpresa ?? '' },
                    { label: 'CNPJ', key: 'cnpj', value: config?.cnpj ?? '' },
                    { label: 'Telefone', key: 'telefone', value: config?.telefone ?? '' },
                    { label: 'Endereço', key: 'endereco', value: config?.endereco ?? '' },
                  ].map(field => (
                    <div key={field.key}>
                      <label className="text-xs text-gray-500">{field.label}</label>
                      <input
                        defaultValue={field.value}
                        onBlur={e => updateMutation.mutate({ [field.key]: e.target.value })}
                        className="mt-1 w-full h-8 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                      />
                    </div>
                  ))}
                </div>
              </div>
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