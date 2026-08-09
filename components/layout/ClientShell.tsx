'use client'
import { useState, useEffect } from 'react'
import Sidebar from './Sidebar'
import Header  from './Header'
import { useDarkMode } from '@/hooks/useDarkMode'

export interface Config {
  comandasAtivo:   boolean
  producaoAtivo:   boolean
  estoqueAtivo:    boolean
  fiscalAtivo:     boolean
  turnoCaixaAtivo: boolean
  consultasAtivo:  boolean
  pedidosAtivo:    boolean
  planoAcaoAtivo:  boolean
  metasAtivo:      boolean
  contasPagarAtivo:         boolean
  contasReceberAtivo:       boolean
  comprasAtivo:             boolean
  // Menus que antes não tinham chave: agora chegam pelo layout, então o
  // Sidebar não precisa mais buscá-los por conta própria na API.
  vendasAtivo:              boolean
  financeiroAtivo:          boolean
  fidelidadeAtivo:          boolean
  entradaNfeAtivo:          boolean
  perdaProdutoAtivo:        boolean
  contagemInventarioAtivo:  boolean
  multiplosLocaisAtivo:     boolean
  logoBase64: string | null
  darkMode:   boolean
}

interface Props {
  children:   React.ReactNode
  tenantSlug: string
  tenantName: string
  config:     Config
}

export default function ClientShell({ children, tenantSlug, tenantName, config }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { darkMode, toggleDarkMode }  = useDarkMode(tenantSlug, config.darkMode ?? false)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSidebarOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  return (
    <div className="flex h-screen overflow-hidden">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <Sidebar
        tenantSlug={tenantSlug}
        tenantName={tenantName}
        config={config}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header
          tenantSlug={tenantSlug}
          tenantName={tenantName}
          config={config}
          darkMode={darkMode}
          onToggleDarkMode={toggleDarkMode}
          onToggleSidebar={() => setSidebarOpen(prev => !prev)}
          logoBase64={config.logoBase64}
        />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}