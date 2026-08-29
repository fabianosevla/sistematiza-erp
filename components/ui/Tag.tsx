'use client'
import type { ReactNode } from 'react'

/**
 * components/ui/Tag.tsx
 *
 * Etiqueta pequena que acompanha títulos de bloco e linhas de listagem.
 * Nesta versão saiu a borda e saiu o CAIXA ALTA: etiqueta em maiúsculas
 * chamava mais atenção que o próprio título ao lado. Fundo claro, texto
 * escuro da mesma família, tamanho pequeno.
 *
 *   <SecaoTitulo titulo="Execuções anteriores" tag={<Tag>Nível 2</Tag>} />
 *   <Tag tom="sucesso">Ativo</Tag>
 */
type Tom = 'neutro' | 'marca' | 'sucesso' | 'atencao' | 'erro' | 'info'

const TONS: Record<Tom, string> = {
  neutro:  'bg-gray-100 text-gray-600',
  marca:   'bg-green-50 text-green-700',
  sucesso: 'bg-green-50 text-green-700',
  atencao: 'bg-amber-50 text-amber-700',
  erro:    'bg-red-50 text-red-600',
  info:    'bg-blue-50 text-blue-700',
}

interface Props {
  children:   ReactNode
  tom?:       Tom
  className?: string
}

export function Tag({ children, tom = 'neutro', className = '' }: Props) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${TONS[tom]} ${className}`}>
      {children}
    </span>
  )
}

/**
 * Título de bloco: texto médio (não bold), etiqueta ao lado e, opcionalmente,
 * ações à direita.
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
        <h2 className="text-[13px] font-medium text-gray-600">{titulo}</h2>
        {tag}
      </div>
      {acoes && <div className="flex items-center gap-2">{acoes}</div>}
    </div>
  )
}

export default Tag
