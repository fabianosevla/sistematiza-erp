'use client'
import { useState, useEffect, useCallback } from 'react'
import Sidebar from './Sidebar'
import Header  from './Header'

export interface Config {
  comandasAtivo:   boolean
  producaoAtivo:   boolean
  estoqueAtivo:    boolean
  fiscalAtivo:     boolean
  consultasAtivo:  boolean
  pedidosAtivo:    boolean
  planoAcaoAtivo:  boolean
  metasAtivo:      boolean
  contasPagarAtivo:         boolean
  contasReceberAtivo:       boolean
  conciliacaoBancariaAtivo: boolean
  comprasAtivo:             boolean
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
  const [darkMode, setDarkMode]       = useState(config.darkMode ?? false)

  useEffect(() => {
    const id  = 'sistematiza-dark'
    let style = document.getElementById(id) as HTMLStyleElement | null
    if (darkMode) {
      if (!style) {
        style = document.createElement('style')
        style.id = id
        document.head.appendChild(style)
      }
      style.textContent = `
        body { background-color: #111827 !important; color: #f9fafb !important; }
        .bg-white { background-color: #1f2937 !important; }
        .bg-gray-50, .bg-gray-100 { background-color: #111827 !important; }
        .border-gray-100, .border-gray-200 { border-color: #374151 !important; }
        .text-gray-900 { color: #f9fafb !important; }
        .text-gray-700, .text-gray-600 { color: #d1d5db !important; }
        .text-gray-500, .text-gray-400 { color: #9ca3af !important; }
      `
    } else {
      style?.remove()
    }
  }, [darkMode])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSidebarOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  const toggleDarkMode = useCallback(() => setDarkMode(prev => !prev), [])

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