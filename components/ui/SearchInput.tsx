'use client'
import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'

/**
 * components/ui/SearchInput.tsx
 *
 * Campo de busca padrão das listagens. Mesma API; o campo agora nasce com
 * fundo cinza-claro e vira branco no foco, como a busca do cabeçalho.
 */
interface Props {
  valor:        string
  onChange:     (valor: string) => void
  placeholder?: string
  limpavel?:    boolean
  className?:   string
  autoFocus?:   boolean
}

export function SearchInput({
  valor, onChange, placeholder = 'Buscar...',
  limpavel = true, className = 'mb-4', autoFocus = false,
}: Props) {
  return (
    <div className={`relative ${className}`}>
      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
      <Input
        value={valor}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className={`bg-gray-50 focus:bg-white ${limpavel ? 'pl-9 pr-9' : 'pl-9'}`}
      />
      {limpavel && valor && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
          aria-label="Limpar busca"
        >
          <X size={14} />
        </button>
      )}
    </div>
  )
}

export default SearchInput
