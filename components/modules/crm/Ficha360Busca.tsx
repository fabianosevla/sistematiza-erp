'use client'
// components/modules/crm/Ficha360Busca.tsx
//
// Combobox de cliente (abre com a lista inteira ao clicar, filtra ao
// digitar — não exige digitar nada antes de mostrar opção, diferente do
// ClienteSelectBusca que já existe pra "Indicado por") + tabela de
// histórico de venda do cliente escolhido, vazia até alguém ser
// selecionado.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { DataTable, type Coluna } from '@/components/ui/DataTable'
import { fmtMoeda as fmt, fmtDataHoraLocal as fmtDataHora } from '@/lib/format'

interface Props { tenantSlug: string }

export default function Ficha360Busca({ tenantSlug }: Props) {
  const [termo, setTermo]     = useState('')
  const [aberto, setAberto]   = useState(false)
  const [selecionado, setSelecionado] = useState<any | null>(null)
  const caixaRef = useRef<HTMLDivElement>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['crm-busca-cliente', tenantSlug, termo],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/crm/clientes?termo=${encodeURIComponent(termo)}`)).json(),
  })
  const resultados: any[] = data?.data?.resultados ?? []

  // Fecha ao clicar fora — mesma ideia do funil de coluna do DataTable, só
  // que sem portal: o combobox aqui não vive dentro de área que rola.
  useEffect(() => {
    if (!aberto) return
    function fora(e: MouseEvent) {
      if (!caixaRef.current?.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [aberto])

  const { data: fichaData, isLoading: loadingFicha } = useQuery({
    queryKey: ['crm-ficha360-preview', tenantSlug, selecionado?.clienteId],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/crm/clientes/${selecionado.clienteId}`)).json(),
    enabled:  !!selecionado,
  })
  const ficha = fichaData?.data
  const vendas: any[] = ficha?.vendas ?? []

  const [filtros, setFiltros] = useState<Record<string, string>>({})
  function aplicarFiltro(chave: string, valor: string) {
    setFiltros(f => {
      const novo = { ...f }
      if (valor) novo[chave] = valor
      else delete novo[chave]
      return novo
    })
  }
  const vendasFiltradas = useMemo(() => {
    const chaves = Object.keys(filtros)
    if (chaves.length === 0) return vendas
    return vendas.filter(v => chaves.every(k => String(v?.[k] ?? '').toLowerCase().includes(filtros[k].toLowerCase())))
  }, [vendas, filtros])
  const opcoesFiltro = useMemo(() => {
    const mapa: Record<string, string[]> = {}
    for (const chave of ['origem', 'status']) {
      const set = new Set<string>()
      for (const v of vendas) { const val = v?.[chave]; if (val) set.add(String(val)) }
      if (set.size > 0) mapa[chave] = Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'))
    }
    return mapa
  }, [vendas])

  const colunas: Coluna[] = [
    { chave: 'vendaId', titulo: 'Venda', largura: 'w-20', render: (v: any) => <span className="font-mono text-xs text-gray-500">#{v.vendaId}</span> },
    { chave: 'vendidaEm', titulo: 'Data', render: (v: any) => fmtDataHora(v.vendidaEm) },
    { chave: 'origem', titulo: 'Origem', esconderAte: 'md', filtravel: true, render: (v: any) => <Badge variant="outline">{v.origem}</Badge> },
    { chave: 'status', titulo: 'Status', esconderAte: 'md', filtravel: true },
    { chave: 'total', titulo: 'Total', alinhamento: 'right', render: (v: any) => <span className="font-semibold">{fmt(v.total)}</span> },
  ]

  function escolher(c: any) {
    setSelecionado(c)
    setTermo('')
    setAberto(false)
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">Escolha um cliente pra ver o histórico de venda. Clique pra abrir a lista inteira, ou digite pra filtrar.</p>

      <div ref={caixaRef} className="relative max-w-md">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
          <Input
            value={aberto ? termo : (selecionado ? (selecionado.nomeFantasia || selecionado.nome) : '')}
            onChange={e => { setTermo(e.target.value); setAberto(true) }}
            onFocus={() => { setTermo(''); setAberto(true) }}
            className="pl-9 pr-8 h-9"
            placeholder="Selecionar cliente..."
          />
          <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" />
        </div>

        {aberto && (
          <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden max-h-72 overflow-y-auto">
            {isLoading ? (
              <p className="text-sm text-gray-400 text-center py-4">Carregando...</p>
            ) : resultados.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">Nenhum cliente encontrado.</p>
            ) : (
              resultados.map(c => (
                <button key={c.clienteId} type="button" onClick={() => escolher(c)}
                  className="w-full text-left px-3 py-2.5 hover:bg-gray-50 border-b border-gray-50 last:border-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{c.nomeFantasia || c.nome}</p>
                  <p className="text-xs text-gray-400 truncate">{c.documento || (c.tipoPessoa === 'PJ' ? 'PJ' : 'PF')}{c.cidade ? ` · ${c.cidade}/${c.uf}` : ''}</p>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {selecionado && ficha && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Saldo cashback: <span className="font-semibold text-gray-900">{fmt(ficha.resumo.saldoCashback)}</span>
            {' · '}Total gasto: <span className="font-semibold text-gray-900">{fmt(ficha.resumo.totalGasto)}</span>
          </p>
          <a href={`/${tenantSlug}/crm/clientes/${selecionado.clienteId}`} className="text-xs text-green-600 hover:text-green-700 font-medium">
            Ver ficha 360° completa →
          </a>
        </div>
      )}

      <DataTable
        colunas={colunas}
        itens={vendasFiltradas}
        chave={(v: any) => v.vendaId}
        carregando={!!selecionado && loadingFicha}
        vazio={selecionado ? 'Esse cliente ainda não tem venda registrada.' : 'Selecione um cliente para ver o histórico.'}
        filtros={filtros}
        onFiltrar={aplicarFiltro}
        opcoesFiltro={opcoesFiltro}
      />
    </div>
  )
}
