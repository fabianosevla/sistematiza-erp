'use client'
import { useState, useEffect, type ReactNode } from 'react'
import { ToastProvider }  from '@/components/ui/Toast'
import Sidebar            from '@/components/layout/Sidebar'
import Header             from '@/components/layout/Header'
import CommandPalette     from '@/components/ui/CommandPalette'

interface Config {
  comandasAtivo:  boolean; producaoAtivo:  boolean; estoqueAtivo:  boolean
  fiscalAtivo:    boolean; consultasAtivo: boolean; pedidosAtivo:  boolean
  planoAcaoAtivo: boolean; metasAtivo:     boolean
}

interface Props { children: ReactNode; tenantSlug: string; tenantName: string; config: Config }

// CSS injetado dinamicamente — mais confiável que globals.css com Tailwind
const DARK_CSS = `
  body { background-color: #0f172a !important; color: #e2e8f0; }
  main  { background-color: #0f172a !important; }

  .bg-white        { background-color: #1e293b !important; }
  .bg-gray-50      { background-color: #111827 !important; }
  .bg-gray-100     { background-color: #1e293b !important; }

  .border-gray-100 { border-color: #2d3748 !important; }
  .border-gray-200 { border-color: #374151 !important; }

  .text-gray-900   { color: #f1f5f9 !important; }
  .text-gray-800   { color: #e2e8f0 !important; }
  .text-gray-700   { color: #cbd5e1 !important; }
  .text-gray-600   { color: #94a3b8 !important; }
  .text-gray-500   { color: #64748b !important; }
  .text-gray-400   { color: #4b5563 !important; }
  .text-gray-300   { color: #374151 !important; }

  input:not([type=checkbox]):not([type=radio]),
  select,
  textarea {
    background-color: #1e293b !important;
    border-color:     #374151 !important;
    color:            #f1f5f9 !important;
  }
  input::placeholder, textarea::placeholder { color: #4b5563 !important; }

  .hover\:bg-gray-50:hover  { background-color: #1e293b !important; }
  .hover\:bg-gray-100:hover { background-color: #263352 !important; }

  thead tr { background-color: #1e293b !important; }
  .divide-gray-50 > * { border-color: #2d3748 !important; }

  .shadow-xl, .shadow-2xl {
    box-shadow: 0 20px 25px -5px rgba(0,0,0,0.6) !important;
  }

  .bg-gray-50\\/20 { background-color: rgba(17,24,39,0.2) !important; }
  .bg-gray-50\\/30 { background-color: rgba(17,24,39,0.3) !important; }
  .bg-gray-50\\/50 { background-color: rgba(17,24,39,0.5) !important; }
  .bg-gray-50\\/80 { background-color: rgba(17,24,39,0.8) !important; }

  .hover\:bg-gray-50\\/80:hover { background-color: rgba(30,41,59,0.8) !important; }
`

const STYLE_ID = 'sistematiza-dark-mode'

function applyDarkMode(on: boolean) {
  const existing = document.getElementById(STYLE_ID)
  if (on) {
    if (!existing) {
      const el = document.createElement('style')
      el.id = STYLE_ID
      el.textContent = DARK_CSS
      document.head.appendChild(el)
    }
    localStorage.setItem('sistematiza_theme', 'dark')
  } else {
    existing?.remove()
    localStorage.setItem('sistematiza_theme', 'light')
  }
}

export default function ClientShell({ children, tenantSlug, tenantName, config }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [darkMode, setDarkMode]       = useState(false)

  // Restaura preferência salva
  useEffect(() => {
    const saved = localStorage.getItem('sistematiza_theme')
    if (saved === 'dark') {
      setDarkMode(true)
      applyDarkMode(true)
    }
  }, [])

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

  function toggleDark() {
    const next = !darkMode
    setDarkMode(next)
    applyDarkMode(next)
  }

  return (
    <ToastProvider>
      <div className="flex h-screen overflow-hidden bg-gray-50">
        {sidebarOpen && (
          <div className="fixed inset-0 bg-black/30 z-30 lg:hidden"
            onClick={() => setSidebarOpen(false)} />
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
            darkMode={darkMode}
            onToggleDark={toggleDark}
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