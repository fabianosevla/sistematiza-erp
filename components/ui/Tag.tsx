'use client'
import type { ReactNode } from 'react'

/**
 * components/ui/Tag.tsx
 *
 * Etiqueta pequena que acompanha títulos de bloco e linhas de listagem.
 * Tom sempre suave — fundo claro, texto escuro da mesma família.
 *
 *   <SecaoTitulo titulo="Execuções anteriores" tag={<Tag>Nível 2</Tag>} />
 *   <Tag tom="sucesso">Ativo</Tag>
 */
type Tom = 'neutro' | 'marca' | 'sucesso' | 'atencao' | 'erro' | 'info'

const TONS: Record<Tom, string> = {
  neutro:  'bg-gray-100 text-gray-600 border-gray-200',
  marca:   'bg-green-50 text-green-700 border-green-200',
  sucesso: 'bg-green-50 text-green-700 border-green-200',
  atencao: 'bg-amber-50 text-amber-700 border-amber-200',
  erro:    'bg-red-50 text-red-600 border-red-200',
  info:    'bg-slate-50 text-slate-600 border-slate-200',
}

interface Props {
  children:   ReactNode
  tom?:       Tom
  className?: string
}

export function Tag({ children, tom = 'neutro', className = '' }: Props) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${TONS[tom]} ${className}`}>
      {children}
    </span>
  )
}

/**
 * Título de bloco no formato do Kuantum: texto forte, etiqueta ao lado e,
 * opcionalmente, ações à direita.
 */
interface SecaoProps {
  titulo:     ReactNode
  tag?:       ReactNode
  acoes?:     ReactNode
  className?: string
}

export function SecaoTitulo({ titulo, tag, acoes, className = '' }: SecaoProps) {
  return (
    <div className={`flex items-center justify-between gap-3 mb-3 ${className}`}>
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-gray-800">{titulo}</h2>
        {tag}
      </div>
      {acoes && <div className="flex items-center gap-2">{acoes}</div>}
    </div>
  )
}

export default Tag