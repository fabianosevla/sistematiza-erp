'use client'
import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'

/**
 * components/ui/SidePanel.tsx
 *
 * Painel lateral de detalhe — substitui o modal em criação, edição e
 * visualização. Abre por cima, à direita, deixando a listagem visível atrás.
 *
 * A API é a mesma do FormModal de propósito: trocar o componente na tela é
 * renomear a tag, sem mexer no conteúdo.
 *
 *   <SidePanel titulo="Novo fornecedor" onClose={fechar} largura="max-w-xl">
 *     <form className="p-6 space-y-4"> ... </form>
 *   </SidePanel>
 *
 * O rodapé fixo é opcional. Usando-o, as ações ficam sempre visíveis mesmo
 * com formulário longo — que é o comportamento do Kuantum.
 */
interface Props {
  titulo:      ReactNode
  onClose:     () => void
  children:    ReactNode
  /** largura máxima: max-w-md | max-w-xl | max-w-2xl | max-w-3xl */
  largura?:    string
  /** linha de apoio abaixo do título (nome do registro, período…) */
  subtitulo?:  ReactNode
  /** conteúdo colado ao título: selo de status, InfoTip */
  cabecalho?:  ReactNode
  /** barra fixa no pé do painel, para Cancelar / Salvar */
  rodape?:     ReactNode
  fecharNoEsc?: boolean
}

export function SidePanel({
  titulo, onClose, children,
  largura = 'max-w-xl',
  subtitulo, cabecalho, rodape,
  fecharNoEsc = true,
}: Props) {
  useEffect(() => {
    if (!fecharNoEsc) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, fecharNoEsc])

  useEffect(() => {
    const anterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = anterior }
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Fundo: mais leve que o do modal — a listagem continua legível atrás */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-gray-900/20 backdrop-blur-[1px]"
        aria-hidden
      />

      <aside
        role="dialog"
        aria-modal="true"
        className={`relative h-full w-full ${largura} bg-white border-l border-gray-200 shadow-2xl flex flex-col animate-[deslizar_.18s_ease-out]`}
      >
        {/* Cabeçalho */}
        <div className="flex items-start justify-between gap-3 px-6 py-5 border-b border-gray-100 flex-shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
              {titulo}
              {cabecalho}
            </h2>
            {subtitulo && <p className="text-xs text-gray-400 mt-0.5 truncate">{subtitulo}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 flex-shrink-0 p-1 -mr-1 rounded-lg hover:bg-gray-50 transition-colors"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        {/* Conteúdo */}
        <div className="flex-1 overflow-y-auto">{children}</div>

        {/* Rodapé fixo */}
        {rodape && (
          <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 flex-shrink-0 bg-white">
            {rodape}
          </div>
        )}
      </aside>

      <style jsx global>{`
        @keyframes deslizar {
          from { transform: translateX(16px); opacity: .6 }
          to   { transform: translateX(0);    opacity: 1  }
        }
      `}</style>
    </div>
  )
}

export default SidePanel