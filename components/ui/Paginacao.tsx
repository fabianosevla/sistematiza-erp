'use client'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface Props {
  page:       number
  totalPages: number
  total:      number
  limit:      number
  onPage:     (page: number) => void
  onLimit:    (limit: number) => void
}

const OPCOES_LIMIT = [10, 20, 50, 100]

export default function Paginacao({ page, totalPages, total, limit, onPage, onLimit }: Props) {
  if (total === 0) return null

  const inicio = (page - 1) * limit + 1
  const fim    = Math.min(page * limit, total)

  return (
    <div className="flex items-center justify-between px-1 py-3 border-t border-gray-100 mt-2">
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400">Registros por página:</span>
        <select
          value={limit}
          onChange={e => { onLimit(Number(e.target.value)); onPage(1) }}
          className="h-7 rounded-lg border border-gray-200 px-2 text-xs focus:outline-none focus:border-green-400"
        >
          {OPCOES_LIMIT.map(n => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
        <span className="text-xs text-gray-400">
          {inicio}–{fim} de {total}
        </span>
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
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
              className={`w-7 h-7 rounded-lg text-xs font-medium transition-colors ${
                p === page
                  ? 'bg-green-600 text-white'
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
          className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  )
}