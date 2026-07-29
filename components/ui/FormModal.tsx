'use client'
import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'

/**
 * components/ui/FormModal.tsx
 *
 * Casca padrão dos modais de formulário. Marcação extraída do FornecedoresView:
 * mesmo fundo, mesmo cartão, mesmo cabeçalho.
 *
 *   <FormModal titulo="Novo fornecedor" onClose={fechar} largura="max-w-2xl">
 *     <form onSubmit={...} className="p-6 space-y-4"> ... </form>
 *   </FormModal>
 *
 * O conteúdo entra como children, então cada tela mantém o formulário que já
 * tem. Este componente cuida só do que se repetia em ~30 arquivos.
 *
 * Ganhos sobre a versão copiada: fecha no Esc e trava a rolagem do fundo.
 */
interface Props {
  titulo:      ReactNode
  onClose:     () => void
  children:    ReactNode
  /** classe de largura máxima: max-w-sm | max-w-lg | max-w-2xl | max-w-4xl… */
  largura?:    string
  /** linha de apoio abaixo do título */
  subtitulo?:  ReactNode
  /** conteúdo opcional colado ao título (selo, InfoTip, contador) */
  cabecalho?:  ReactNode
  fecharNoEsc?: boolean
}

export function FormModal({
  titulo, onClose, children,
  largura = 'max-w-2xl',
  subtitulo,
  cabecalho,
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
    >
      <div className={`bg-white rounded-2xl shadow-xl w-full ${largura} mx-4 max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-start justify-between p-6 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              {titulo}
              {cabecalho}
            </h2>
            {subtitulo && <p className="text-sm text-gray-400 mt-0.5">{subtitulo}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 flex-shrink-0"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export default FormModal