'use client'
import { ChevronLeft, ChevronRight } from 'lucide-react'

/**
 * components/ui/Paginacao.tsx
 *
 * Mesma API. Mudou só o traje: página ativa em grafite (não verde cheio),
 * botões hairline, texto de faixa em cinza frio.
 *
 *  1. onLimit é opcional. Sem ele, o seletor de "registros por página"
 *     não aparece, mas a faixa "1–20 de 143" continua.
 *  2. className opcional, para o DataTable ajustar o recuo quando a paginação
 *     fica dentro do cartão da tabela.
 */
interface Props {
  page:       number
  totalPages: number
  total:      number
  limit:      number
  onPage:     (page: number) => void
  onLimit?:   (limit: number) => void
  className?: string
}

const OPCOES_LIMIT = [10, 20, 50, 100]

export default function Paginacao({
  page, totalPages, total, limit, onPage, onLimit,
  className = 'px-1 mt-2',
}: Props) {
  if (total === 0) return null

  const inicio = (page - 1) * limit + 1
  const fim    = Math.min(page * limit, total)

  return (
    <div className={`flex items-center justify-between py-3 border-t border-gray-100 ${className}`}>
      <div className="flex items-center gap-2">
        {onLimit && (
          <>
            <span className="text-[12px] text-gray-400">Registros por página:</span>
            <select
              value={limit}
              onChange={e => { onLimit(Number(e.target.value)); onPage(1) }}
              className="h-7 rounded-lg border border-gray-200 bg-white px-2 text-[12px] text-gray-700 focus:outline-none focus:border-green-400"
            >
              {OPCOES_LIMIT.map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </>
        )}
        <span className="text-[12px] text-gray-400">
          {inicio}–{fim} de {total}
        </span>
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft size={14} />
        </button>

        {/* Números de página */}
        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
          let p: number
          if (totalPages <= 5) {
            p = i + 1
          } else if (page <= 3) {
            p = i + 1
          } else if (page >= totalPages - 2) {
            p = totalPages - 4 + i
          } else {
            p = page - 2 + i
          }
          return (
            <button
              key={p}
              onClick={() => onPage(p)}
              className={`w-7 h-7 rounded-lg text-[12px] font-medium transition-colors ${
                p === page
                  ? 'bg-gray-900 text-white'
                  : 'border border-gray-200 hover:bg-gray-50 text-gray-600'
              }`}
            >
              {p}
            </button>
          )
        })}

        <button
          onClick={() => onPage(page + 1)}
          disabled={page >= totalPages}
          className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  )
}
