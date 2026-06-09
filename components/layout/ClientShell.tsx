'use client'
import { useState, useEffect, type ReactNode } from 'react'
import { ToastProvider } from '@/components/ui/Toast'
import Sidebar        from '@/components/layout/Sidebar'
import Header         from '@/components/layout/Header'
import CommandPalette from '@/components/ui/CommandPalette'

interface Config {
  comandasAtivo: boolean; producaoAtivo: boolean; estoqueAtivo:   boolean
  fiscalAtivo:   boolean; consultasAtivo: boolean; pedidosAtivo:  boolean
  planoAcaoAtivo: boolean
}

interface Props { children: ReactNode; tenantSlug: string; tenantName: string; config: Config }

export default function ClientShell({ children, tenantSlug, tenantName, config }: Props) {
  const [sidebarOpen, setSidebarOpen]     = useState(false)
  const [paletteOpen, setPaletteOpen]     = useState(false)

  // Ctrl+K global
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setPaletteOpen(o => !o)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <ToastProvider>
      <div className="flex h-screen overflow-hidden bg-gray-50">
        {sidebarOpen && (
          <div className="fixed inset-0 bg-black/30 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />
        )}

        <Sidebar
          tenantSlug={tenantSlug} tenantName={tenantName} config={config}
          open={sidebarOpen} onClose={() => setSidebarOpen(false)}
        />

        <div className="flex-1 flex flex-col overflow-hidden">
          <Header
            tenantSlug={tenantSlug} tenantName={tenantName}
            onMenuToggle={() => setSidebarOpen(o => !o)}
            onPaletteOpen={() => setPaletteOpen(true)}
          />
          <main className="flex-1 overflow-y-auto">
            <div className="p-6 max-w-[1600px]">{children}</div>
          </main>
        </div>
      </div>

      <CommandPalette
        tenantSlug={tenantSlug}
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
      />
    </ToastProvider>
  )
}