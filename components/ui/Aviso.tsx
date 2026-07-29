'use client'
import type { ReactNode } from 'react'

/**
 * components/ui/Aviso.tsx
 *
 * Faixa de aviso dentro da tela — não confundir com:
 *   Toast        → ação concluída, some sozinho
 *   ConfirmModal → pergunta antes de agir
 *   InfoTip      → explicação sob demanda, no ícone de "i"
 *   Aviso        → consequência ou resultado que precisa ficar visível
 *
 * As classes vieram das telas de Clientes e Usuários; nada mudou de aparência.
 *
 *   <Aviso tom="sucesso">Cliente removido.</Aviso>
 *   <Aviso tom="erro">{formError}</Aviso>
 */
type Tom = 'sucesso' | 'erro' | 'atencao' | 'info'

const TONS: Record<Tom, string> = {
  sucesso: 'bg-green-50 border-green-200 text-green-700',
  erro:    'bg-red-50 border-red-200 text-red-600',
  atencao: 'bg-amber-50 border-amber-200 text-amber-700',
  info:    'bg-gray-50 border-gray-200 text-gray-600',
}

interface Props {
  children:   ReactNode
  tom?:       Tom
  icone?:     ReactNode
  className?: string
}

export function Aviso({ children, tom = 'info', icone, className = '' }: Props) {
  return (
    <div className={`rounded-lg border text-sm px-4 py-2.5 ${TONS[tom]} ${icone ? 'flex items-center gap-2' : ''} ${className}`}>
      {icone}
      <span>{children}</span>
    </div>
  )
}

export default Aviso