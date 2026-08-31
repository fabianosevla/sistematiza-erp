'use client'
// components/ui/ClienteSelectBusca.tsx
//
// Campo de busca + seleção de um cliente já cadastrado. Usado hoje só pra
// "Indicado por" (cadastro de cliente no PDV e em Cadastros > Clientes),
// mas é genérico o bastante pra qualquer tela que precise escolher UM
// cliente existente por nome.
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { Input } from '@/components/ui/input'

interface Props {
  tenantSlug: string
  clienteId:  number | null
  nomeAtual:  string
  onChange:   (clienteId: number | null, nome: string) => void
  placeholder?: string
}

export function ClienteSelectBusca({ tenantSlug, clienteId, nomeAtual, onChange, placeholder }: Props) {
  const [busca, setBusca] = useState('')

  const { data } = useQuery({
    queryKey: ['cliente-select-busca', tenantSlug, busca],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/cadastros/clientes?search=${encodeURIComponent(busca)}&limit=8`)).json(),
    enabled:  busca.trim().length > 1,
    staleTime: 15000,
  })
  const opcoes: any[] = Array.isArray(data?.data?.data) ? data.data.data : []

  if (clienteId && nomeAtual) {
    return (
      <div className="mt-1 flex items-center justify-between px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg">
        <span className="text-sm text-gray-900 truncate">{nomeAtual}</span>
        <button type="button" onClick={() => { onChange(null, ''); setBusca('') }}
          className="text-gray-400 hover:text-gray-700 ml-1 flex-shrink-0">
          <X size={12} />
        </button>
      </div>
    )
  }

  return (
    <div className="relative mt-1">
      <Input value={busca} onChange={e => setBusca(e.target.value)}
        placeholder={placeholder ?? 'Nome do cliente...'} className="h-9 text-sm" />
      {busca.trim().length > 1 && opcoes.length > 0 && (
        <div className="absolute z-20 w-full mt-0.5 bg-white border border-gray-100 rounded-lg shadow-lg overflow-hidden max-h-48 overflow-y-auto">
          {opcoes.map((c: any) => {
            const nome = c.nomeFantasia?.trim() || c.nomeCompleto
            return (
              <button key={c.clienteId} type="button"
                onClick={() => { onChange(c.clienteId, nome); setBusca('') }}
                className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-100 last:border-0 text-sm text-gray-700 truncate">
                {nome}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default ClienteSelectBusca
