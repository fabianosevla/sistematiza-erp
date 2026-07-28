'use client'
// components/ui/InfoTip.tsx
//
// ─── PADRÃO DE AJUDA CONTEXTUAL DO SISTEMA ───────────────────────────────────
// Regra: explicação NÃO fica escrita na tela. Vira este ícone; o texto aparece
// ao passar o mouse, ao focar pelo teclado (Tab) ou ao tocar (celular).
//
// Uso:
//   <InfoTip>Texto curto explicando o que a tela faz.</InfoTip>
//   <InfoTip titulo="Composição total">conteúdo em JSX, com listas etc.</InfoTip>
//
// Comportamento: abre com 120ms de atraso no hover (instantâneo no foco/clique),
// fecha ao sair, no Esc ou em novo clique. Renderizado em portal no <body>, então
// nunca é cortado por tabelas, cards ou modais. Reposiciona no scroll/resize e
// inverte para baixo quando não há espaço acima.
import { useState, useRef, useEffect, useCallback, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Info } from 'lucide-react'

interface Props {
  children:   ReactNode
  titulo?:    string
  ariaLabel?: string
  size?:      number
  className?: string
}

const LARGURA = 280

export function InfoTip({ children, titulo, ariaLabel = 'Mais informações', size = 14, className = '' }: Props) {
  const [aberto, setAberto]   = useState(false)
  const [montado, setMontado] = useState(false)
  const [pos, setPos]         = useState<{ top: number; left: number; seta: number; acima: boolean } | null>(null)
  const gatilhoRef            = useRef<HTMLButtonElement>(null)
  const timer                 = useRef<any>(null)

  useEffect(() => { setMontado(true) }, [])

  const calcular = useCallback(() => {
    const el = gatilhoRef.current
    if (!el) return
    const r      = el.getBoundingClientRect()
    const acima  = r.top > 150
    const centro = r.left + r.width / 2
    const left   = Math.min(Math.max(8, centro - LARGURA / 2), window.innerWidth - LARGURA - 8)
    const seta   = Math.min(Math.max(12, centro - left), LARGURA - 12)
    setPos({ top: acima ? r.top - 10 : r.bottom + 10, left, seta, acima })
  }, [])

  const abrir = useCallback((delay = 120) => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => { calcular(); setAberto(true) }, delay)
  }, [calcular])

  const fechar = useCallback(() => {
    clearTimeout(timer.current)
    setAberto(false)
  }, [])

  useEffect(() => {
    if (!aberto) return
    const reposicionar = () => calcular()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') fechar() }
    window.addEventListener('scroll', reposicionar, true)
    window.addEventListener('resize', reposicionar)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('scroll', reposicionar, true)
      window.removeEventListener('resize', reposicionar)
      window.removeEventListener('keydown', onKey)
    }
  }, [aberto, calcular, fechar])

  useEffect(() => () => clearTimeout(timer.current), [])

  return (
    <>
      <button
        ref={gatilhoRef}
        type="button"
        aria-label={ariaLabel}
        onMouseEnter={() => abrir()}
        onMouseLeave={fechar}
        onFocus={() => abrir(0)}
        onBlur={fechar}
        onClick={() => (aberto ? fechar() : abrir(0))}
        className={`inline-flex items-center justify-center align-middle text-zinc-300 transition-colors hover:text-zinc-500 focus:text-zinc-500 focus:outline-none ${className}`}
      >
        <Info size={size} strokeWidth={2} />
      </button>

      {montado && aberto && pos && createPortal(
        <div
          role="tooltip"
          style={{ top: pos.top, left: pos.left, width: LARGURA, transform: pos.acima ? 'translateY(-100%)' : undefined }}
          className="pointer-events-none fixed z-[100]"
        >
          <div className="relative rounded-lg bg-zinc-900 px-3 py-2 text-xs leading-relaxed text-zinc-100 shadow-xl">
            {titulo && <p className="mb-1 font-semibold text-white">{titulo}</p>}
            {children}
            <span
              style={{ left: pos.seta }}
              className={`absolute -ml-1 h-2 w-2 rotate-45 bg-zinc-900 ${pos.acima ? '-bottom-1' : '-top-1'}`}
            />
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

export default InfoTip