'use client'
// components/modules/crm/SegmentacaoTab.tsx
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { DataTable, type Coluna } from '@/components/ui/DataTable'
import { InfoTip } from '@/components/ui/InfoTip'
import { fmtDataLocal as fmtData } from '@/lib/format'

interface Props { tenantSlug: string }

const BALDE_LABEL: Record<string, string> = {
  ativo: 'Ativo', novo: 'Novo', em_risco: 'Em risco', sumindo: 'Sumindo', inativo: 'Inativo', sem_compra: 'Sem compra',
}
const BALDE_COR: Record<string, string> = {
  ativo: 'text-green-700 bg-green-50', novo: 'text-blue-700 bg-blue-50', em_risco: 'text-amber-700 bg-amber-50',
  sumindo: 'text-orange-700 bg-orange-50', inativo: 'text-red-700 bg-red-50', sem_compra: 'text-gray-600 bg-gray-100',
}

export default function SegmentacaoTab({ tenantSlug }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['crm-segmentacao', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/crm/segmentacao`)).json(),
  })
  const todos: any[] = data?.data?.linhas ?? []
  const contagem: Record<string, number> = data?.data?.contagem ?? {}

  // Mesmo padrão de filtro por coluna do resto do sistema — o balde é só
  // mais uma coluna filtrável, não um controle à parte.
  const [filtros, setFiltros] = useState<Record<string, string>>({})
  function aplicarFiltro(chave: string, valor: string) {
    setFiltros(f => {
      const novo = { ...f }
      if (valor) novo[chave] = valor
      else delete novo[chave]
      return novo
    })
  }
  const linhas = useMemo(() => {
    const chaves = Object.keys(filtros)
    if (chaves.length === 0) return todos
    return todos.filter(l => chaves.every(k => {
      const v = k === 'balde' ? (BALDE_LABEL[l.balde] ?? l.balde) : l?.[k]
      return String(v ?? '').toLowerCase().includes(filtros[k].toLowerCase())
    }))
  }, [todos, filtros])
  const opcoesFiltro = useMemo(() => {
    const mapa: Record<string, string[]> = {}
    for (const chave of ['nome', 'tipoPessoa']) {
      const set = new Set<string>()
      for (const l of todos) { const v = l?.[chave]; if (v) set.add(String(v)) }
      if (set.size > 0) mapa[chave] = Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'))
    }
    mapa.balde = Object.keys(contagem).filter(b => contagem[b] > 0).map(b => BALDE_LABEL[b] ?? b)
    return mapa
  }, [todos, contagem])

  const colunas: Coluna[] = [
    { chave: 'nome', titulo: 'Cliente', principal: true, filtravel: true },
    { chave: 'tipoPessoa', titulo: 'Tipo', largura: 'w-16', esconderAte: 'md', filtravel: true },
    { chave: 'qtdCompras', titulo: 'Compras', alinhamento: 'right', esconderAte: 'md' },
    { chave: 'ultimaCompra', titulo: 'Última compra', render: (l: any) => l.ultimaCompra ? fmtData(l.ultimaCompra) : '—' },
    { chave: 'balde', titulo: 'Segmento', filtravel: true, render: (l: any) => (
      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${BALDE_COR[l.balde] ?? ''}`}>{BALDE_LABEL[l.balde] ?? l.balde}</span>
    )},
  ]

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 size={20} className="text-gray-300 animate-spin" /></div>

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500 inline-flex items-center gap-1">
        Calculado na hora, a partir do histórico de compra — sem cadastro nenhum pra manter. Filtre por segmento clicando no funil da coluna.
        <InfoTip titulo="Como os baldes são definidos">
          Ativo: comprou nos últimos 30 dias. Novo: primeira e única compra nesse período.
          Em risco: 30 a 60 dias sem comprar. Sumindo: 60 a 120 dias. Inativo: mais de 120 dias
          ou nunca comprou.
        </InfoTip>
      </p>

      <DataTable
        colunas={colunas}
        itens={linhas}
        chave={(l: any) => l.clienteId}
        vazio="Nenhum cliente nesse segmento."
        filtros={filtros}
        onFiltrar={aplicarFiltro}
        opcoesFiltro={opcoesFiltro}
      />
    </div>
  )
}
