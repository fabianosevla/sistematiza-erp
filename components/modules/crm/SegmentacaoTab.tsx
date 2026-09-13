'use client'
// components/modules/crm/SegmentacaoTab.tsx
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { DataTable, type Coluna } from '@/components/ui/DataTable'
import { InfoTip } from '@/components/ui/InfoTip'
import { fmtDataLocal as fmtData } from '@/lib/format'

interface Props { tenantSlug: string }

const BALDES = [
  { key: 'ativo',      label: 'Ativo',      cor: 'text-green-700 bg-green-50' },
  { key: 'novo',        label: 'Novo',       cor: 'text-blue-700 bg-blue-50' },
  { key: 'em_risco',    label: 'Em risco',   cor: 'text-amber-700 bg-amber-50' },
  { key: 'sumindo',     label: 'Sumindo',    cor: 'text-orange-700 bg-orange-50' },
  { key: 'inativo',     label: 'Inativo',    cor: 'text-red-700 bg-red-50' },
  { key: 'sem_compra',  label: 'Sem compra', cor: 'text-gray-600 bg-gray-100' },
] as const

export default function SegmentacaoTab({ tenantSlug }: Props) {
  const [filtro, setFiltro] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['crm-segmentacao', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/crm/segmentacao`)).json(),
  })
  const linhas: any[] = data?.data?.linhas ?? []
  const contagem: Record<string, number> = data?.data?.contagem ?? {}
  const linhasFiltradas = filtro ? linhas.filter(l => l.balde === filtro) : linhas

  const colunas: Coluna[] = [
    { chave: 'nome', titulo: 'Cliente', principal: true, filtravel: true },
    { chave: 'tipoPessoa', titulo: 'Tipo', largura: 'w-16', esconderAte: 'md' },
    { chave: 'qtdCompras', titulo: 'Compras', alinhamento: 'right', esconderAte: 'md' },
    { chave: 'ultimaCompra', titulo: 'Última compra', render: (l: any) => l.ultimaCompra ? fmtData(l.ultimaCompra) : '—' },
    { chave: 'balde', titulo: 'Segmento', render: (l: any) => {
      const b = BALDES.find(b => b.key === l.balde)
      return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${b?.cor ?? ''}`}>{b?.label ?? l.balde}</span>
    }},
  ]

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 size={20} className="text-gray-300 animate-spin" /></div>

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500 inline-flex items-center gap-1">
        Calculado na hora, a partir do histórico de compra — sem cadastro nenhum pra manter.
        <InfoTip titulo="Como os baldes são definidos">
          Ativo: comprou nos últimos 30 dias. Novo: primeira e única compra nesse período.
          Em risco: 30 a 60 dias sem comprar. Sumindo: 60 a 120 dias. Inativo: mais de 120 dias
          ou nunca comprou.
        </InfoTip>
      </p>

      <div className="flex flex-wrap gap-2">
        {BALDES.map(b => (
          <button key={b.key} onClick={() => setFiltro(f => f === b.key ? null : b.key)}
            className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
              filtro === b.key ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
            }`}>
            {b.label} <span className="text-xs opacity-70">({contagem[b.key] ?? 0})</span>
          </button>
        ))}
      </div>

      <DataTable colunas={colunas} itens={linhasFiltradas} chave={(l: any) => l.clienteId} vazio="Nenhum cliente nesse segmento." />
    </div>
  )
}
