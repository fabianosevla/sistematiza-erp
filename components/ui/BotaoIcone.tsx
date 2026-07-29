'use client'
import type { ReactNode } from 'react'

/**
 * components/ui/BotaoIcone.tsx
 *
 * Botão de ação das linhas de tabela (editar, excluir, histórico).
 * As cores são exatamente as que as telas já usam hoje:
 *
 *   padrao    cinza → verde   (editar, ver)
 *   perigo    cinza → vermelho (excluir)
 *   destaque  roxo  → roxo escuro (histórico)
 *
 *   <BotaoIcone titulo="Editar" onClick={...}><Pencil size={14} /></BotaoIcone>
 */
type Variante = 'padrao' | 'perigo' | 'destaque'

const CORES: Record<Variante, string> = {
  padrao:   'text-gray-300 hover:text-green-600',
  perigo:   'text-gray-300 hover:text-red-500',
  destaque: 'text-purple-400 hover:text-purple-600',
}

interface Props {
  titulo:     string
  onClick:    () => void
  children:   ReactNode
  variante?:  Variante
  disabled?:  boolean
  className?: string
}

export function BotaoIcone({
  titulo, onClick, children, variante = 'padrao', disabled = false, className = '',
}: Props) {
  return (
    <button
      type="button"
      title={titulo}
      aria-label={titulo}
      onClick={onClick}
      disabled={disabled}
      className={`p-1 transition-colors disabled:opacity-40 ${CORES[variante]} ${className}`}
    >
      {children}
    </button>
  )
}

export default BotaoIcone