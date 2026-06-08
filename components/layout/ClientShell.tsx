'use client'
import { useState, type ReactNode } from 'react'
import { ToastProvider } from '@/components/ui/Toast'
import Sidebar from '@/components/layout/Sidebar'
import Header  from '@/components/layout/Header'

interface Config {
  comandasAtivo:  boolean
  producaoAtivo:  boolean
  estoqueAtivo:   boolean
  fiscalAtivo:    boolean
  consultasAtivo: boolean
  pedidosAtivo:   boolean
  planoAcaoAtivo: boolean
}

interface Props {
  children:   ReactNode
  tenantSlug: string
  tenantName: string
  config:     Config
}

export default function ClientShell({ children, tenantSlug, tenantName, config }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <ToastProvider>
      <div className="flex h-screen overflow-hidden bg-gray-50">
        {/* Overlay mobile */}
        {sidebarOpen && (
          <div className="fixed inset-0 bg-black/30 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />
        )}

        <Sidebar
          tenantSlug={tenantSlug}
          tenantName={tenantName}
          config={config}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        <div className="flex-1 flex flex-col overflow-hidden">
          <Header
            tenantSlug={tenantSlug}
            tenantName={tenantName}
            onMenuToggle={() => setSidebarOpen(o => !o)}
          />
          <main className="flex-1 overflow-y-auto">
            <div className="p-6 max-w-[1600px]">
              {children}
            </div>
          </main>
        </div>
      </div>
    </ToastProvider>
  )
}