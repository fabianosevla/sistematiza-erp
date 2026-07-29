'use client'
import type { ReactNode } from 'react'

/**
 * components/ui/BotaoIcone.tsx
 *
 * Botão de ação das linhas de tabela. As cores são exatamente as que as telas
 * já usam hoje — nenhuma foi inventada:
 *
 *   padrao    cinza → verde     editar, ver
 *   perigo    cinza → vermelho  excluir
 *   destaque  roxo  → roxo      histórico
 *   info      cinza → azul      editar (Usuários, Domínios)
 *   alerta    cinza → âmbar     resetar senha
 *
 *   <BotaoIcone titulo="Editar" onClick={...}><Pencil size={14} /></BotaoIcone>
 */
type Variante = 'padrao' | 'perigo' | 'destaque' | 'info' | 'alerta'
type Tamanho  = 'sm' | 'md'

const CORES: Record<Variante, string> = {
  padrao:   'text-gray-300 hover:text-green-600',
  perigo:   'text-gray-300 hover:text-red-500',
  destaque: 'text-purple-400 hover:text-purple-600',
  info:     'text-gray-400 hover:text-blue-600',
  alerta:   'text-gray-400 hover:text-amber-500',
}

const TAMANHOS: Record<Tamanho, string> = {
  sm: 'p-1',
  md: 'p-1.5',
}

interface Props {
  titulo:     string
  onClick:    () => void
  children:   ReactNode
  variante?:  Variante
  tamanho?:   Tamanho
  disabled?:  boolean
  className?: string
}

export function BotaoIcone({
  titulo, onClick, children,
  variante = 'padrao', tamanho = 'sm',
  disabled = false, className = '',
}: Props) {
  return (
    <button
      type="button"
      title={titulo}
      aria-label={titulo}
      onClick={onClick}
      disabled={disabled}
      className={`${TAMANHOS[tamanho]} rounded transition-colors disabled:opacity-40 ${CORES[variante]} ${className}`}
    >
      {children}
    </button>
  )
}

export default BotaoIcone