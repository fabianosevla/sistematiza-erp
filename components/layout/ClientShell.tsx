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
  qtdCaixas:       number
  regimeTurno:     string
  consultasAtivo:  boolean
  pedidosAtivo:    boolean
  planoAcaoAtivo:  boolean
  metasAtivo:      boolean
  cardapioAtivo:   boolean
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

  // ── A RODA DO MOUSE NÃO MEXE EM CAMPO NUMÉRICO ────────────────────────────
  //
  // <input type="number"> em foco reage à rolagem do mouse: o valor sobe ou
  // desce sozinho enquanto a pessoa rola a página. Num campo de acréscimo do
  // PDV isso altera o preço da venda sem ninguém tocar em nada, e o operador
  // só descobre se conferir o total.
  //
  // Tirar as setas com CSS não resolve — a rolagem é comportamento do
  // navegador, não do enfeite.
  //
  // A defesa é tirar o foco do campo assim que a roda gira sobre ele: o valor
  // fica como está e a página rola normalmente. Um ouvinte só, no shell, vale
  // para o sistema inteiro — não depende de lembrar disso em cada tela nova.
  //
  // Precisa ser na fase de captura. Na fase de bolha (o padrão), o evento já
  // passou pelo campo antes de chegar aqui — o navegador incrementa o valor
  // durante essa passagem, e o blur() chega tarde demais para a rolada em
  // curso. Na captura o ouvinte roda a caminho do alvo, antes desse ajuste.
  useEffect(() => {
    const naRoda = (e: WheelEvent) => {
      const el = document.activeElement
      if (
        el instanceof HTMLInputElement &&
        el.type === 'number' &&
        (e.target === el || el.contains(e.target as Node))
      ) {
        el.blur()
      }
    }
    document.addEventListener('wheel', naRoda, { passive: true, capture: true })
    return () => document.removeEventListener('wheel', naRoda, { capture: true })
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
        darkMode={darkMode}
        onToggleDarkMode={toggleDarkMode}
      />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header
          tenantSlug={tenantSlug}
          logoBase64={config.logoBase64}
          onToggleSidebar={() => setSidebarOpen(prev => !prev)}
        />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}