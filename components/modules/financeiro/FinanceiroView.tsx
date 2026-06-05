'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X, Download, Trash2, TrendingUp, TrendingDown, DollarSign } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'

interface Props { tenantSlug: string }

function formatCents(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('pt-BR')
}

function getMesAtual() {
  const now = new Date()
  return {
    inicio: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10),
    fim:    new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10),
  }
}

const CATEGORIAS = [
  'Matéria Prima', 'Embalagem', 'Entrega / Frete', 'Funcionários',
  'Aluguel', 'Energia / Água', 'Marketing', 'Impostos', 'Outros',
]

function exportCSV(despesas: any[]) {
  const headers = ['ID', 'Nome', 'Categoria', 'Valor', 'Data', 'Recorrente']
  const rows = despesas.map(d => [
    d.despesaId,
    d.nome,
    d.categoria,
    (d.valor / 100).toFixed(2),
    new Date(d.dataDespesa).toLocaleDateString('pt-BR'),
    d.recorrente ? 'Sim' : 'Não',
  ])
  const csv  = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `despesas-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function FinanceiroView({ tenantSlug }: Props) {
  const queryClient = useQueryClient()
  const apiBase = `/api/${tenantSlug}/financeiro`
  const mesAtual = getMesAtual()

  const [aba, setAba]               = useState<'despesas' | 'dre'>('despesas')
  const [page, setPage]             = useState(1)
  const [dataInicio, setDataInicio] = useState(mesAtual.inicio)
  const [dataFim, setDataFim]       = useState(mesAtual.fim)
  const [categoria, setCategoria]   = useState('')
  const [showNova, setShowNova]     = useState(false)

  // Form nova despesa
  const [nome, setNome]                         = useState('')
  const [categoriaNova, setCategoriaNova]       = useState(CATEGORIAS[0])
  const [valor, setValor]                       = useState('')
  const [dataDespesa, setDataDespesa]           = useState(new Date().toISOString().slice(0, 10))
  const [recorrente, setRecorrente]             = useState(false)
  const [periodo, setPeriodo]                   = useState('mensal')
  const [observacao, setObservacao]             = useState('')
  const [erroDespesa, setErroDespesa]           = useState('')

  // KPIs
  const { data: kpisData } = useQuery({
    queryKey: ['financeiro-kpis', tenantSlug],
    queryFn: async () => {
      const res = await fetch(`${apiBase}?tipo=kpis`)
      return res.json()
    },
    refetchInterval: 30000,
  })

  // Despesas
  const { data: despesasData, isLoading } = useQuery({
    queryKey: ['despesas', tenantSlug, page, dataInicio, dataFim, categoria],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' })
      if (dataInicio) params.set('dataInicio', dataInicio)
      if (dataFim)    params.set('dataFim', dataFim)
      if (categoria)  params.set('categoria', categoria)
      const res = await fetch(`${apiBase}?${params}`)
      return res.json()
    },
  })

  // DRE
  const { data: dreData, isLoading: dreLoading } = useQuery({
    queryKey: ['dre', tenantSlug, dataInicio, dataFim],
    queryFn: async () => {
      const params = new URLSearchParams({ tipo: 'dre', dataInicio, dataFim })
      const res = await fetch(`${apiBase}?${params}`)
      return res.json()
    },
    enabled: aba === 'dre',
  })

  // Criar despesa
  const criarMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(apiBase, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome,
          categoria:          categoriaNova,
          valor:              Math.round(parseFloat(valor.replace(',', '.')) * 100),
          dataDespesa,
          recorrente,
          periodoRecorrencia: recorrente ? periodo : undefined,
          observacao:         observacao || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message ?? 'Erro ao criar despesa')
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['despesas', tenantSlug] })
      queryClient.invalidateQueries({ queryKey: ['financeiro-kpis', tenantSlug] })
      queryClient.invalidateQueries({ queryKey: ['dre', tenantSlug] })
      setShowNova(false)
      resetForm()
    },
    onError: (err: any) => setErroDespesa(err.message),
  })

  // Excluir despesa
  const excluirMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${apiBase}/${id}`, { method: 'DELETE' })
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['despesas', tenantSlug] })
      queryClient.invalidateQueries({ queryKey: ['financeiro-kpis', tenantSlug] })
      queryClient.invalidateQueries({ queryKey: ['dre', tenantSlug] })
    },
  })

  function resetForm() {
    setNome('')
    setCategoriaNova(CATEGORIAS[0])
    setValor('')
    setDataDespesa(new Date().toISOString().slice(0, 10))
    setRecorrente(false)
    setPeriodo('mensal')
    setObservacao('')
    setErroDespesa('')
  }

  const kpis     = kpisData?.data
  const despesas = despesasData?.data?.data ?? []
  const meta     = despesasData?.data?.meta
  const dre      = dreData?.data

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Financeiro</h1>
          <p className="text-sm text-gray-400 mt-0.5">Receitas, despesas e resultado</p>
        </div>
        <div className="flex gap-2">
          {aba === 'despesas' && (
            <Button variant="outline" onClick={() => exportCSV(despesas)}>
              <Download size={14} className="mr-1.5" /> Exportar CSV
            </Button>
          )}
          {aba === 'despesas' && (
            <Button onClick={() => { resetForm(); setShowNova(true) }}>
              <Plus size={15} className="mr-1.5" /> Nova despesa
            </Button>
          )}
        </div>
      </div>

      {/* KPIs do mês */}
      {kpis && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp size={14} className="text-green-500" />
              <p className="text-xs text-gray-400">Receita hoje</p>
            </div>
            <p className="text-xl font-bold text-gray-900">{formatCents(kpis.receitaHoje)}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp size={14} className="text-green-500" />
              <p className="text-xs text-gray-400">Receita do mês</p>
            </div>
            <p className="text-xl font-bold text-gray-900">{formatCents(kpis.receitaMes)}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown size={14} className="text-red-500" />
              <p className="text-xs text-gray-400">Despesas do mês</p>
            </div>
            <p className="text-xl font-bold text-gray-900">{formatCents(kpis.despesasMes)}</p>
          </div>
          <div className={`rounded-xl border p-4 ${kpis.resultado >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
            <div className="flex items-center gap-2 mb-1">
              <DollarSign size={14} className={kpis.resultado >= 0 ? 'text-green-600' : 'text-red-600'} />
              <p className="text-xs text-gray-400">Resultado do mês</p>
            </div>
            <p className={`text-xl font-bold ${kpis.resultado >= 0 ? 'text-green-700' : 'text-red-700'}`}>
              {formatCents(kpis.resultado)}
            </p>
          </div>
        </div>
      )}

      {/* Abas */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
        {([
          { value: 'despesas', label: 'Despesas' },
          { value: 'dre',      label: 'DRE' },
        ] as const).map(a => (
          <button
            key={a.value}
            onClick={() => setAba(a.value)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${aba === a.value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {a.label}
          </button>
        ))}
      </div>

      {/* Filtros de período */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Label className="text-xs whitespace-nowrap">De:</Label>
          <Input type="date" value={dataInicio} onChange={e => { setDataInicio(e.target.value); setPage(1) }} className="h-9 text-sm w-36" />
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs whitespace-nowrap">Até:</Label>
          <Input type="date" value={dataFim} onChange={e => { setDataFim(e.target.value); setPage(1) }} className="h-9 text-sm w-36" />
        </div>
        {aba === 'despesas' && (
          <select
            value={categoria}
            onChange={e => { setCategoria(e.target.value); setPage(1) }}
            className="h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 bg-white"
          >
            <option value="">Todas as categorias</option>
            {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        <div className="flex gap-1">
          {[
            { label: 'Este mês', inicio: mesAtual.inicio, fim: mesAtual.fim },
            { label: 'Mês anterior', inicio: new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toISOString().slice(0, 10), fim: new Date(new Date().getFullYear(), new Date().getMonth(), 0).toISOString().slice(0, 10) },
            { label: 'Este ano', inicio: `${new Date().getFullYear()}-01-01`, fim: `${new Date().getFullYear()}-12-31` },
          ].map(atalho => (
            <button
              key={atalho.label}
              onClick={() => { setDataInicio(atalho.inicio); setDataFim(atalho.fim); setPage(1) }}
              className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors"
            >
              {atalho.label}
            </button>
          ))}
        </div>
      </div>

      {/* Aba Despesas */}
      {aba === 'despesas' && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Nome</th>
                <th className="text-left text-xs font-medium text-gray-400 px-4 py-3 hidden md:table-cell">Categoria</th>
                <th className="text-left text-xs font-medium text-gray-400 px-4 py-3 hidden lg:table-cell">Data</th>
                <th className="text-left text-xs font-medium text-gray-400 px-4 py-3 hidden lg:table-cell">Recorrente</th>
                <th className="text-right text-xs font-medium text-gray-400 px-4 py-3">Valor</th>
                <th className="px-4 py-3 w-16" />
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">Carregando...</td></tr>
              ) : despesas.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">Nenhuma despesa encontrada.</td></tr>
              ) : despesas.map((d: any) => (
                <tr key={d.despesaId} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-gray-900">{d.nome}</p>
                    {d.observacao && <p className="text-xs text-gray-400 truncate max-w-48">{d.observacao}</p>}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <Badge variant="secondary">{d.categoria}</Badge>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 hidden lg:table-cell">{formatDate(d.dataDespesa)}</td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    {d.recorrente && <Badge variant="outline">{d.periodoRecorrencia}</Badge>}
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-semibold text-red-600">{formatCents(d.valor)}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => { if (confirm(`Excluir "${d.nome}"?`)) excluirMutation.mutate(d.despesaId) }}
                      className="text-gray-300 hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {meta && meta.totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
              <p className="text-xs text-gray-400">Página {meta.page} de {meta.totalPages} — {meta.total} despesas</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Anterior</Button>
                <Button variant="outline" size="sm" disabled={page >= meta.totalPages} onClick={() => setPage(p => p + 1)}>Próximo</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Aba DRE */}
      {aba === 'dre' && (
        <div className="space-y-4">
          {dreLoading ? (
            <div className="text-center py-12 text-sm text-gray-400">Calculando...</div>
          ) : dre ? (
            <>
              {/* Resumo */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                  <p className="text-xs text-green-600 font-medium">Receita total</p>
                  <p className="text-2xl font-bold text-green-700 mt-1">{formatCents(dre.receita)}</p>
                  <p className="text-xs text-green-500 mt-0.5">{dre.qtdVendas} venda{dre.qtdVendas !== 1 ? 's' : ''}</p>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                  <p className="text-xs text-red-600 font-medium">Total despesas</p>
                  <p className="text-2xl font-bold text-red-700 mt-1">{formatCents(dre.totalDespesas)}</p>
                </div>
                <div className={`rounded-xl border p-4 ${dre.resultado >= 0 ? 'bg-green-50 border-green-300' : 'bg-red-50 border-red-300'}`}>
                  <p className={`text-xs font-medium ${dre.resultado >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {dre.resultado >= 0 ? 'Lucro' : 'Prejuízo'}
                  </p>
                  <p className={`text-2xl font-bold mt-1 ${dre.resultado >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                    {formatCents(Math.abs(dre.resultado))}
                  </p>
                  {dre.receita > 0 && (
                    <p className="text-xs mt-0.5" style={{ color: dre.resultado >= 0 ? '#15803d' : '#dc2626' }}>
                      Margem: {((dre.resultado / dre.receita) * 100).toFixed(1)}%
                    </p>
                  )}
                </div>
              </div>

              {/* Despesas por categoria */}
              {Object.keys(dre.porCategoria).length > 0 && (
                <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100">
                    <h3 className="text-sm font-semibold text-gray-700">Despesas por categoria</h3>
                  </div>
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Categoria</th>
                        <th className="text-right text-xs font-medium text-gray-400 px-4 py-3">Valor</th>
                        <th className="text-right text-xs font-medium text-gray-400 px-4 py-3">% Despesas</th>
                        <th className="text-right text-xs font-medium text-gray-400 px-4 py-3">% Receita</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(dre.porCategoria)
                        .sort(([, a], [, b]) => (b as number) - (a as number))
                        .map(([cat, val]) => (
                          <tr key={cat} className="border-b border-gray-50 last:border-0">
                            <td className="px-4 py-3 text-sm text-gray-700">{cat}</td>
                            <td className="px-4 py-3 text-right text-sm font-medium text-red-600">{formatCents(val as number)}</td>
                            <td className="px-4 py-3 text-right text-xs text-gray-400">
                              {dre.totalDespesas > 0 ? (((val as number) / dre.totalDespesas) * 100).toFixed(1) : 0}%
                            </td>
                            <td className="px-4 py-3 text-right text-xs text-gray-400">
                              {dre.receita > 0 ? (((val as number) / dre.receita) * 100).toFixed(1) : 0}%
                            </td>
                          </tr>
                        ))
                      }
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : null}
        </div>
      )}

      {/* Modal Nova Despesa */}
      {showNova && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">Nova despesa</h2>
              <button onClick={() => setShowNova(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <Label>Nome *</Label>
                <Input value={nome} onChange={e => setNome(e.target.value)} className="mt-1" placeholder="Ex: Farinha de trigo" autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Categoria *</Label>
                  <select
                    value={categoriaNova}
                    onChange={e => setCategoriaNova(e.target.value)}
                    className="mt-1 w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                  >
                    {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <Label>Data *</Label>
                  <Input type="date" value={dataDespesa} onChange={e => setDataDespesa(e.target.value)} className="mt-1" />
                </div>
              </div>
              <div>
                <Label>Valor (R$) *</Label>
                <Input
                  type="number" min="0" step="0.01"
                  value={valor}
                  onChange={e => setValor(e.target.value)}
                  className="mt-1" placeholder="0,00"
                />
              </div>
              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={recorrente}
                    onChange={e => setRecorrente(e.target.checked)}
                    className="w-4 h-4 rounded"
                  />
                  <span className="text-sm text-gray-700">Despesa recorrente</span>
                </label>
                {recorrente && (
                  <select
                    value={periodo}
                    onChange={e => setPeriodo(e.target.value)}
                    className="mt-2 w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                  >
                    <option value="semanal">Semanal</option>
                    <option value="mensal">Mensal</option>
                    <option value="trimestral">Trimestral</option>
                    <option value="anual">Anual</option>
                  </select>
                )}
              </div>
              <div>
                <Label>Observação</Label>
                <textarea
                  value={observacao}
                  onChange={e => setObservacao(e.target.value)}
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 resize-none"
                  placeholder="Observação opcional"
                />
              </div>
              {erroDespesa && (
                <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-600">{erroDespesa}</p>
                </div>
              )}
              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="outline" onClick={() => setShowNova(false)}>Cancelar</Button>
                <Button
                  onClick={() => criarMutation.mutate()}
                  disabled={!nome || !valor || criarMutation.isPending}
                >
                  {criarMutation.isPending ? 'Salvando...' : 'Salvar despesa'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}