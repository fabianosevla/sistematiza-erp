'use client'
import { useState, useEffect, type ReactNode } from 'react'
import { ToastProvider }  from '@/components/ui/Toast'
import Sidebar            from '@/components/layout/Sidebar'
import Header             from '@/components/layout/Header'
import CommandPalette     from '@/components/ui/CommandPalette'

export interface Config {
  comandasAtivo:  boolean
  producaoAtivo:  boolean
  estoqueAtivo:   boolean
  fiscalAtivo:    boolean
  consultasAtivo: boolean
  pedidosAtivo:   boolean
  planoAcaoAtivo: boolean
  metasAtivo:     boolean
}

interface Props { children: ReactNode; tenantSlug: string; tenantName: string; config: Config }

const DARK_CSS = `
  body,main { background-color: #0f172a !important; color: #e2e8f0; }
  .bg-white { background-color: #1e293b !important; }
  .bg-gray-50 { background-color: #111827 !important; }
  .bg-gray-100 { background-color: #1e293b !important; }
  .border-gray-100 { border-color: #2d3748 !important; }
  .border-gray-200 { border-color: #374151 !important; }
  .text-gray-900 { color: #f1f5f9 !important; }
  .text-gray-800 { color: #e2e8f0 !important; }
  .text-gray-700 { color: #cbd5e1 !important; }
  .text-gray-600 { color: #94a3b8 !important; }
  .text-gray-500 { color: #64748b !important; }
  .text-gray-400 { color: #4b5563 !important; }
  input:not([type=checkbox]):not([type=radio]),select,textarea {
    background-color: #1e293b !important;
    border-color: #374151 !important;
    color: #f1f5f9 !important;
  }
  .hover\\:bg-gray-50:hover { background-color: #1e293b !important; }
  thead tr { background-color: #1e293b !important; }
  .divide-gray-50 > * { border-color: #2d3748 !important; }
`
const STYLE_ID = 'sistematiza-dark-mode'

function applyDark(on: boolean) {
  const el = document.getElementById(STYLE_ID)
  if (on && !el) {
    const s = document.createElement('style')
    s.id = STYLE_ID; s.textContent = DARK_CSS
    document.head.appendChild(s)
  } else if (!on && el) { el.remove() }
  localStorage.setItem('sistematiza_theme', on ? 'dark' : 'light')
}

export default function ClientShell({ children, tenantSlug, tenantName, config }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [darkMode, setDarkMode]       = useState(false)

  useEffect(() => {
    if (localStorage.getItem('sistematiza_theme') === 'dark') {
      setDarkMode(true); applyDark(true)
    }
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault(); setPaletteOpen(o => !o)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  function toggleDark() { const next = !darkMode; setDarkMode(next); applyDark(next) }

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
            darkMode={darkMode} onToggleDark={toggleDark}
          />
          <main className="flex-1 overflow-y-auto">
            <div className="p-6 max-w-[1600px]">{children}</div>
          </main>
        </div>
      </div>
      <CommandPalette tenantSlug={tenantSlug} open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </ToastProvider>
  )
}