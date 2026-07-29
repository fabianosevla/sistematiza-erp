'use client'
import type { ReactNode } from 'react'

/**
 * components/ui/PageHeader.tsx
 *
 * Cabeçalho padrão de tela: título, linha de apoio e botões de ação.
 * A marcação foi extraída do FornecedoresView — nenhuma classe foi alterada.
 *
 *   <PageHeader
 *     titulo="Fornecedores"
 *     subtitulo={meta ? `${meta.total} registros` : ''}
 *     acoes={<Button onClick={handleNew}>Novo</Button>}
 *   />
 */
interface Props {
  titulo:     string
  subtitulo?: ReactNode
  acoes?:     ReactNode
  className?: string
}

export function PageHeader({ titulo, subtitulo, acoes, className = '' }: Props) {
  return (
    <div className={`flex items-center justify-between mb-6 ${className}`}>
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">{titulo}</h1>
        {subtitulo !== undefined && subtitulo !== null && subtitulo !== '' && (
          <p className="text-sm text-gray-400 mt-0.5">{subtitulo}</p>
        )}
      </div>
      {acoes && <div className="flex gap-2">{acoes}</div>}
    </div>
  )
}

export default PageHeader