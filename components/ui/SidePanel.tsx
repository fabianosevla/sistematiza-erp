'use client'
// components/ui/SidePanel.tsx
//
// ─── PAINEL LATERAL — SUBSTITUI OS MODAIS DE CADASTRO ────────────────────────
//
// Regra do sistema, inalterada: criação e edição de registro acontecem AQUI,
// não em modal. Modal continua valendo só para confirmação (ConfirmModal).
//
// Nesta versão mudou apenas o acabamento: véu mais claro, sombra lateral
// difusa em vez de shadow-2xl duro, cabeçalho com linha hairline e título
// em 18px semibold com tracking negativo. Comportamento intacto:
// • Altura total da tela, encostado à direita.
// • Um quarto da largura, com piso de 420px.
// • Expandir/Recolher.
// • NÃO fecha ao salvar; clique fora NÃO fecha; Esc fecha.
import { useEffect, useState, type ReactNode } from 'react'
import { X, Maximize2, Minimize2 } from 'lucide-react'

interface Props {
  titulo:      string
  subtitulo?:  string
  /** Chips, selos ou InfoTip ao lado do título. */
  cabecalho?:  ReactNode
  /** Barra fixa no rodapé — normalmente os botões de ação. */
  rodape?:     ReactNode
  onClose:     () => void
  children:    ReactNode
  /** Largura quando recolhido. Padrão: um quarto da tela, mínimo 420px. */
  largura?:    string
  /** Abre já expandido. Útil em telas com muitos campos, como Ficha Técnica. */
  iniciarExpandido?: boolean
}

export function SidePanel({
  titulo, subtitulo, cabecalho, rodape, onClose, children,
  largura = 'w-[25vw] min-w-[420px]',
  iniciarExpandido = false,
}: Props) {
  const [expandido, setExpandido] = useState(iniciarExpandido)
  const [montado, setMontado]     = useState(false)

  // Um quadro de atraso antes de animar a entrada: sem isso o painel
  // aparece já no lugar final e a transição não acontece.
  useEffect(() => {
    const t = requestAnimationFrame(() => setMontado(true))
    return () => cancelAnimationFrame(t)
  }, [])

  // Esc fecha. Trava a rolagem do fundo enquanto o painel está aberto —
  // rolar a lista atrás enquanto se digita é desorientador.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const overflowAnterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflowAnterior
    }
  }, [onClose])

  return (
    <>
      {/* Véu. Escurece a lista atrás sem escondê-la, e NÃO fecha ao clique:
          um clique errado não pode apagar um formulário preenchido. */}
      <div
        className={`fixed inset-0 z-40 transition-opacity duration-200 ${montado ? 'opacity-100' : 'opacity-0'}`}
        style={{ backgroundColor: 'rgba(26,31,54,0.24)' }}
        aria-hidden
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        style={{ boxShadow: '-14px 0 44px rgba(16,24,40,0.10)' }}
        className={[
          'fixed top-0 right-0 z-50 h-screen bg-white flex flex-col',
          'border-l border-gray-200',
          'transition-[width,transform] duration-200 ease-out',
          expandido ? 'w-screen' : largura,
          montado ? 'translate-x-0' : 'translate-x-full',
        ].join(' ')}
      >
        {/* Cabeçalho */}
        <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-4 border-b border-gray-200 flex-shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <h2 className="text-[18px] font-semibold text-gray-900 tracking-tighter truncate">{titulo}</h2>
              {cabecalho}
            </div>
            {subtitulo && (
              <p className="text-[12.5px] text-gray-400 mt-1 truncate">{subtitulo}</p>
            )}
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => setExpandido(v => !v)}
              title={expandido ? 'Recolher' : 'Expandir'}
              aria-label={expandido ? 'Recolher painel' : 'Expandir painel'}
              className="flex items-center gap-1.5 px-2.5 h-8 rounded-lg text-[12px] font-medium text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
            >
              {expandido ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              <span className="hidden sm:inline">{expandido ? 'Recolher' : 'Expandir'}</span>
            </button>
            <button
              onClick={onClose}
              title="Fechar"
              aria-label="Fechar painel"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-colors"
            >
              <X size={17} />
            </button>
          </div>
        </div>

        {/* Conteúdo. Expandido, só uma margem lateral — não um teto de
            largura centralizado. */}
        <div className="flex-1 overflow-y-auto">
          <div className={expandido ? 'px-6 xl:px-16' : ''}>
            {children}
          </div>
        </div>

        {/* Rodapé fixo. Fica visível mesmo com o formulário rolado. */}
        {rodape && (
          <div className="px-6 py-4 border-t border-gray-200 flex-shrink-0 bg-white">
            <div className={`flex items-center justify-end gap-3 ${expandido ? 'px-6 xl:px-16' : ''}`}>
              {rodape}
            </div>
          </div>
        )}
      </aside>
    </>
  )
}

export default SidePanel
