'use client'
// components/modules/crm/Ficha360Busca.tsx
//
// Busca de cliente pra abrir a Ficha 360° (rota própria, /crm/clientes/[id])
// — mesma lógica de busca por nome/documento que Cadastros → Clientes já usa.
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'

interface Props { tenantSlug: string }

export default function Ficha360Busca({ tenantSlug }: Props) {
  const [termo, setTermo] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['crm-busca-cliente', tenantSlug, termo],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/crm/clientes?termo=${encodeURIComponent(termo)}`)).json(),
    enabled:  termo.trim().length >= 2,
  })
  const resultados: any[] = data?.data?.resultados ?? []

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500 inline-flex items-center gap-1">
        Busque um cliente pra ver histórico de compra, cashback, pedidos e indicações num lugar só.
      </p>

      <div className="relative max-w-md">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
        <Input value={termo} onChange={e => setTermo(e.target.value)} className="pl-9 h-9"
          placeholder="Nome, razão social ou documento..." />
      </div>

      {termo.trim().length >= 2 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden max-w-2xl">
          {isLoading ? (
            <p className="text-sm text-gray-400 text-center py-8">Buscando...</p>
          ) : resultados.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Nenhum cliente encontrado.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {resultados.map(c => (
                <a key={c.clienteId} href={`/${tenantSlug}/crm/clientes/${c.clienteId}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-gray-50">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{c.nomeFantasia || c.nome}</p>
                    <p className="text-xs text-gray-400">{c.documento || (c.tipoPessoa === 'PJ' ? 'PJ' : 'PF')}{c.cidade ? ` · ${c.cidade}/${c.uf}` : ''}</p>
                  </div>
                  <span className="text-xs text-green-600 font-medium">Ver ficha 360° →</span>
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
