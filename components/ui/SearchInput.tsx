'use client'
import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'

/**
 * components/ui/SearchInput.tsx
 *
 * Campo de busca padrão das listagens. Marcação extraída do FornecedoresView.
 *
 *   <SearchInput
 *     valor={search}
 *     onChange={v => { setSearch(v); setPage(1) }}
 *     placeholder="Buscar fornecedores..."
 *   />
 *
 * O botão de limpar só aparece quando há texto; passe limpavel={false} para
 * reproduzir exatamente o comportamento antigo de telas que não o tinham.
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
      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
      <Input
        value={valor}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className={limpavel ? 'pl-9 pr-9' : 'pl-9'}
      />
      {limpavel && valor && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          aria-label="Limpar busca"
        >
          <X size={14} />
        </button>
      )}
    </div>
  )
}

export default SearchInput